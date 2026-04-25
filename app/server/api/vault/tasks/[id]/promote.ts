import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { createTaskDocument, readTaskDocument } from "../../../../services/vault/write";
import { resolveTaskFilePath, resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: `${field} is required.` });
  }
  return value.trim();
}

function readStringArray(body: Record<string, unknown>, field: string): ReadonlyArray<string> {
  const value = body[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a string array.` });
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function replaceIssueBody(objective: string, acceptanceCriteria: ReadonlyArray<string>, originalBody: string): string {
  const trimmedOriginal = originalBody.trim();
  const parts = [
    `## Objective\n\n${objective}`,
    `## Acceptance Criteria\n\n${acceptanceCriteria.map((item) => `- ${item}`).join("\n")}`,
  ];

  if (trimmedOriginal.length > 0) {
    parts.push(`## Reporter Notes\n\n${trimmedOriginal}`);
  }

  return `${parts.join("\n\n")}\n`;
}

export async function promoteIssueCapture(taskId: string, body: unknown) {
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }
  if (!isPlainRecord(body)) {
    throw createError({ statusCode: 400, statusMessage: "Promotion body is required." });
  }

  const boardId = readString(body, "boardId");
  const columnId = readString(body, "columnId");
  const assignee = readString(body, "assignee");
  const objective = readString(body, "objective");
  const acceptanceCriteria = readStringArray(body, "acceptanceCriteria");
  const vaultRoot = resolveVaultWorkspaceRoot();
  const now = new Date();

  const filePath = resolveTaskFilePath(taskId, vaultRoot)
  const current = await readTaskDocument(filePath)
  if (!current.frontmatter.tags.includes("issue-capture")) {
    throw createError({ statusCode: 400, statusMessage: `Task ${taskId} is already a normal task.` });
  }

  const nextFrontmatter = {
    ...current.frontmatter,
    board_id: boardId,
    column: columnId,
    status: "todo" as const,
    assignee,
    tags: current.frontmatter.tags.filter((tag) => tag !== "issue-capture"),
    updated_at: now.toISOString(),
    heartbeat_at: now.toISOString(),
    locked_by: assignee,
    locked_at: now.toISOString(),
    lock_expires_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
  }

  await createTaskDocument({
    filePath,
    frontmatter: nextFrontmatter,
    body: replaceIssueBody(objective, acceptanceCriteria, current.body),
  })

  return {
    task: {
      id: nextFrontmatter.id,
      title: nextFrontmatter.title,
      status: nextFrontmatter.status,
      priority: nextFrontmatter.priority,
      assignee: nextFrontmatter.assignee,
      boardId: nextFrontmatter.board_id,
      columnId: nextFrontmatter.column,
    },
  };
}

export default defineEventHandler(async (event) => {
  return await promoteIssueCapture(getRouterParam(event, "id") || "", await readBody(event));
});
