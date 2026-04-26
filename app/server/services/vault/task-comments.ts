import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createError } from "h3";

import type { ReadModelTask } from "../../models/read-model";
import { appendIssueComment, parseIssueComments } from "./issue-comments";
import { publishRealtimeUpdate } from "../realtime/bus";
import { readCanonicalVaultReadModel } from "./read";
import { resolveTaskFilePath, resolveVaultWorkspaceRoot } from "./runtime";
import { syncTaskDocument } from "./write";

export interface TaskCommentRecord {
  readonly author: string;
  readonly timestamp: string;
  readonly body: string;
}

export interface TaskThreadRecord {
  readonly id: string;
  readonly taskId: string;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly comments: ReadonlyArray<TaskCommentRecord>;
  readonly sourcePath: string;
}

function parseValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "null") return null;
  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return JSON.parse(trimmed);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

function splitDocument(content: string): { readonly frontmatter: string; readonly body: string } {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") {
    throw new Error("Thread document must start with YAML frontmatter.");
  }
  const closingFenceIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingFenceIndex === -1) {
    throw new Error("Thread document is missing a closing frontmatter fence.");
  }
  return {
    frontmatter: lines.slice(1, closingFenceIndex).join("\n"),
    body: lines.slice(closingFenceIndex + 1).join("\n"),
  };
}

function parseFrontmatter(frontmatter: string): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (match === null) {
      throw new Error(`Unsupported frontmatter line: ${line}`);
    }
    record[match[1]] = parseValue(match[2]);
  }
  return record;
}

function buildThreadId(taskId: string): string {
  return `thread-${taskId}`;
}

function resolveThreadSourcePath(threadId: string): string {
  return join("vault", "shared", "threads", `${threadId}.md`);
}

function resolveThreadFilePath(vaultRoot: string, threadId: string): string {
  return join(vaultRoot, resolveThreadSourcePath(threadId));
}

function serializeThreadDocument(input: {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly commentsBody: string;
}): string {
  return [
    "---",
    `id: ${JSON.stringify(input.id)}`,
    'type: "thread"',
    `workspace_id: ${JSON.stringify(input.workspaceId)}`,
    `project_id: ${JSON.stringify(input.projectId)}`,
    `task_id: ${JSON.stringify(input.taskId)}`,
    `created_at: ${JSON.stringify(input.createdAt)}`,
    `updated_at: ${JSON.stringify(input.updatedAt)}`,
    "---",
    "",
    input.commentsBody.trim().length > 0 ? input.commentsBody.trimEnd() : "## Comments",
    "",
  ].join("\n");
}

async function readTaskOrThrow(taskId: string, vaultRoot: string): Promise<ReadModelTask> {
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const task = readModel.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw createError({ statusCode: 404, statusMessage: `Task ${taskId} was not found.` });
  }
  return task;
}

async function ensureTaskThreadLink(task: ReadModelTask, threadId: string, actorId: string, vaultRoot: string): Promise<void> {
  if (task.links.some((link) => link.projectId === task.projectId && link.threadId === threadId)) {
    return;
  }

  await syncTaskDocument({
    filePath: resolveTaskFilePath(task.id, vaultRoot),
    actorId,
    mutate: (current) => ({
      links: [...current.links, { project: task.projectId, thread: threadId }],
    }),
  });
}

export async function readTaskThread(taskId: string, options: { vaultRoot?: string } = {}): Promise<TaskThreadRecord> {
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const task = await readTaskOrThrow(taskId, vaultRoot);
  const threadId = task.links[0]?.threadId ?? buildThreadId(taskId);
  const sourcePath = resolveThreadSourcePath(threadId);
  const filePath = join(vaultRoot, sourcePath);

  try {
    const content = await readFile(filePath, "utf8");
    const split = splitDocument(content);
    const frontmatter = parseFrontmatter(split.frontmatter);
    return {
      id: typeof frontmatter.id === "string" ? frontmatter.id : threadId,
      taskId,
      projectId: task.projectId,
      workspaceId: task.workspaceId,
      createdAt: typeof frontmatter.created_at === "string" ? frontmatter.created_at : null,
      updatedAt: typeof frontmatter.updated_at === "string" ? frontmatter.updated_at : null,
      comments: parseIssueComments(split.body),
      sourcePath,
    };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return {
        id: threadId,
        taskId,
        projectId: task.projectId,
        workspaceId: task.workspaceId,
        createdAt: null,
        updatedAt: null,
        comments: [],
        sourcePath,
      };
    }
    throw error;
  }
}

export async function appendTaskComment(taskId: string, input: { author: string; body: string; now?: Date; vaultRoot?: string }) {
  const author = input.author.trim();
  const body = input.body.trim();
  if (author.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "author is required." });
  }
  if (body.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "body is required." });
  }

  const vaultRoot = input.vaultRoot ?? resolveVaultWorkspaceRoot();
  const now = input.now ?? new Date();
  const task = await readTaskOrThrow(taskId, vaultRoot);
  const existingThread = await readTaskThread(taskId, { vaultRoot });
  const threadId = existingThread.id;
  const filePath = resolveThreadFilePath(vaultRoot, threadId);
  const timestamp = now.toISOString();
  const existingCommentsBody = existingThread.comments.length > 0
    ? `## Comments\n\n${existingThread.comments.map((comment) => `### ${comment.author} | ${comment.timestamp}\n${comment.body}`).join("\n\n")}`
    : "";
  const commentsBody = appendIssueComment(existingCommentsBody, {
    author,
    timestamp,
    body,
  });

  await mkdir(join(vaultRoot, "vault", "shared", "threads"), { recursive: true });
  await writeFile(filePath, serializeThreadDocument({
    id: threadId,
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    taskId,
    createdAt: existingThread.createdAt ?? timestamp,
    updatedAt: timestamp,
    commentsBody,
  }), "utf8");

  await ensureTaskThreadLink(task, threadId, author, vaultRoot);

  publishRealtimeUpdate({
    kind: "vault.changed",
    reason: "task.commented",
    taskId,
    agentId: null,
    source: author,
    timestamp,
  });

  return await readTaskThread(taskId, { vaultRoot });
}
