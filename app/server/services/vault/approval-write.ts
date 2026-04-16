import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { ApprovalFrontmatter, VaultDocument } from "./repository";

const APPROVAL_FRONTMATTER_KEYS: ReadonlyArray<keyof ApprovalFrontmatter> = [
  "id",
  "type",
  "workspace_id",
  "project_id",
  "board_id",
  "task_id",
  "status",
  "outcome",
  "requested_by",
  "requested_at",
  "decided_by",
  "decided_at",
  "reason",
  "created_at",
  "updated_at",
];

type ApprovalDocument = VaultDocument<ApprovalFrontmatter>;

export interface UpsertApprovalRequest {
  readonly vaultRoot: string;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly boardId: string;
  readonly actorId: string;
  readonly reason: string | null;
  readonly outcome: ApprovalFrontmatter["outcome"];
  readonly status: string;
  readonly now: Date;
}

function stringifyValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  return String(value);
}

function parseValue(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed === "null") {
    return null;
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }

  return trimmed;
}

function splitDocument(content: string): { readonly frontmatter: string; readonly body: string } {
  const lines = content.split(/\r?\n/);
  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");

  if (lines[0] !== "---" || closingIndex === -1) {
    throw new Error("Approval document must include YAML frontmatter.");
  }

  return {
    frontmatter: lines.slice(1, closingIndex).join("\n"),
    body: lines.slice(closingIndex + 1).join("\n"),
  };
}

function parseFrontmatter(frontmatter: string): ApprovalFrontmatter {
  const record: Record<string, unknown> = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      throw new Error(`Unsupported frontmatter line: ${line}`);
    }

    record[match[1]] = parseValue(match[2]);
  }

  return record as unknown as ApprovalFrontmatter;
}

function serializeFrontmatter(frontmatter: ApprovalFrontmatter): string {
  return APPROVAL_FRONTMATTER_KEYS.map((key) => `${String(key)}: ${stringifyValue(frontmatter[key])}`).join("\n");
}

function serializeApprovalDocument(frontmatter: ApprovalFrontmatter, body: string): string {
  const bodySuffix = body.length === 0 ? "" : `\n${body}`;
  return `---\n${serializeFrontmatter(frontmatter)}\n---${bodySuffix}`;
}

async function readApprovalDocument(filePath: string): Promise<ApprovalDocument> {
  const content = await readFile(filePath, "utf8");
  const split = splitDocument(content);

  return {
    sourcePath: filePath,
    frontmatter: parseFrontmatter(split.frontmatter),
    body: split.body,
  };
}

async function writeApprovalDocumentAtomic(filePath: string, document: ApprovalDocument): Promise<void> {
  const directory = dirname(filePath);
  const tempFilePath = join(directory, `.${basename(filePath)}.${randomUUID()}.tmp`);

  await mkdir(directory, { recursive: true });

  try {
    await writeFile(tempFilePath, serializeApprovalDocument(document.frontmatter, document.body), "utf8");
    await rename(tempFilePath, filePath);
  } finally {
    await rm(tempFilePath, { force: true }).catch(() => undefined);
  }
}

function compareDescending(left: string, right: string): number {
  return right.localeCompare(left);
}

export async function upsertLatestApprovalForTask(request: UpsertApprovalRequest): Promise<ApprovalDocument> {
  const approvalsDir = join(request.vaultRoot, "vault", "shared", "approvals");
  await mkdir(approvalsDir, { recursive: true });
  const files = (await readdir(approvalsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(approvalsDir, entry.name));

  const taskApprovals = await Promise.all(files.map(readApprovalDocument));
  const current =
    taskApprovals
      .filter((approval) => approval.frontmatter.task_id === request.taskId)
      .sort(
        (left, right) =>
          compareDescending(left.frontmatter.updated_at, right.frontmatter.updated_at) ||
          compareDescending(left.frontmatter.created_at, right.frontmatter.created_at) ||
          right.frontmatter.id.localeCompare(left.frontmatter.id),
      )[0] ?? null;

  const nowIso = request.now.toISOString();
  const frontmatter: ApprovalFrontmatter = current === null
    ? {
        id: `approval-${randomUUID()}`,
        type: "approval",
        workspace_id: request.workspaceId,
        project_id: request.projectId,
        board_id: request.boardId,
        task_id: request.taskId,
        status: request.status,
        outcome: request.outcome,
        requested_by: request.actorId,
        requested_at: nowIso,
        decided_by: request.outcome === "pending" ? null : request.actorId,
        decided_at: request.outcome === "pending" ? null : nowIso,
        reason: request.reason,
        created_at: nowIso,
        updated_at: nowIso,
      }
    : {
        ...current.frontmatter,
        workspace_id: request.workspaceId,
        project_id: request.projectId,
        board_id: request.boardId,
        task_id: request.taskId,
        status: request.status,
        outcome: request.outcome,
        requested_by: request.outcome === "pending" ? request.actorId : current.frontmatter.requested_by,
        requested_at: request.outcome === "pending" ? nowIso : current.frontmatter.requested_at,
        decided_by: request.outcome === "pending" ? null : request.actorId,
        decided_at: request.outcome === "pending" ? null : nowIso,
        reason: request.reason,
        updated_at: nowIso,
      };

  const filePath = current?.sourcePath ?? join(approvalsDir, `${frontmatter.id}.md`);
  const body = current?.body ?? `# Approval ${frontmatter.id}\n`;
  const document: ApprovalDocument = {
    sourcePath: filePath,
    frontmatter,
    body,
  };

  await writeApprovalDocumentAtomic(filePath, document);
  return document;
}
