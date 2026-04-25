import { createError, defineEventHandler, readBody } from "h3";

import type { TaskPriority } from "../../../shared/vault/schema";
import { writeAuditNote } from "../../services/vault/audit-write";
import { formatTaskInputIssues, validateTaskInput } from "../../services/vault/task-input";
import { VaultSchemaError } from "../../services/vault/write";
import { createVaultTask, TaskCreateError } from "../../services/vault/task-create";
import { resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export function buildBody(
  objective: string | undefined,
  acceptanceCriteria: string[] | undefined,
  constraints: string[] | undefined,
  contextFiles: string[] | undefined,
): string {
  const parts: string[] = [];

  if (objective) {
    parts.push(`## Objective\n\n${objective.trim()}`);
  }

  if (acceptanceCriteria && acceptanceCriteria.length > 0) {
    parts.push(`## Acceptance Criteria\n\n${acceptanceCriteria.map((c) => `- ${c}`).join("\n")}`);
  }

  if (constraints && constraints.length > 0) {
    parts.push(`## Constraints\n\n${constraints.map((c) => `- ${c}`).join("\n")}`);
  }

  if (contextFiles && contextFiles.length > 0) {
    parts.push(`## Context Files\n\n${contextFiles.map((f) => `- ${f}`).join("\n")}`);
  }

  return parts.join("\n\n");
}

export async function createVaultTaskFromBody(body: unknown) {
  if (!isPlainRecord(body)) {
    throw createError({ statusCode: 400, statusMessage: "Request body must be an object." });
  }

  const allowedKeys = [
    "title",
    "projectId",
    "boardId",
    "columnId",
    "priority",
    "assignee",
    "requiredCapability",
    "tags",
    "dependsOn",
    "objective",
    "acceptanceCriteria",
    "constraints",
    "contextFiles",
    "sourceIssueId",
    "github_issue_id",
  ] as const;
  const bodyKeys = Object.keys(body);
  const invalidKeys = bodyKeys.filter((key) => !allowedKeys.includes(key as (typeof allowedKeys)[number]));

  if (invalidKeys.length > 0) {
    throw createError({ statusCode: 400, statusMessage: `Unsupported task create fields: ${invalidKeys.join(", ")}.` });
  }

  if (
    typeof body.title !== "string" ||
    typeof body.projectId !== "string" ||
    typeof body.boardId !== "string" ||
    typeof body.columnId !== "string" ||
    typeof body.priority !== "string" ||
    (body.assignee !== undefined && typeof body.assignee !== "string") ||
    (body.requiredCapability !== undefined && typeof body.requiredCapability !== "string")
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "title, projectId, boardId, columnId, and priority are required.",
    });
  }

  if (
    (body.tags !== undefined && !isStringArray(body.tags))
    || (body.dependsOn !== undefined && !isStringArray(body.dependsOn))
    || (body.acceptanceCriteria !== undefined && !isStringArray(body.acceptanceCriteria))
    || (body.constraints !== undefined && !isStringArray(body.constraints))
    || (body.contextFiles !== undefined && !isStringArray(body.contextFiles))
  ) {
    throw createError({ statusCode: 400, statusMessage: "tags, dependsOn, acceptanceCriteria, constraints, and contextFiles must be string arrays when provided." });
  }

  const issues = validateTaskInput({
    title: body.title,
    objective: typeof body.objective === "string" ? body.objective : undefined,
    acceptanceCriteria: body.acceptanceCriteria,
    contextFiles: body.contextFiles,
  });

  if (issues.length > 0) {
    throw createError({ statusCode: 400, statusMessage: formatTaskInputIssues(issues) });
  }

  const vaultRoot = resolveVaultWorkspaceRoot();
  const result = await createVaultTask({
    title: body.title,
    projectId: body.projectId,
    boardId: body.boardId,
    columnId: body.columnId as string,
    priority: body.priority as TaskPriority,
    assignee: typeof body.assignee === "string" ? body.assignee : undefined,
    requiredCapability: typeof body.requiredCapability === "string" ? body.requiredCapability : undefined,
    tags: body.tags,
    dependsOn: body.dependsOn,
    body: buildBody(body.objective, body.acceptanceCriteria, body.constraints, body.contextFiles),
    sourceIssueId: typeof body.sourceIssueId === "string" && body.sourceIssueId.trim().length > 0 ? body.sourceIssueId.trim() : undefined,
    githubIssueId: typeof body.github_issue_id === "string" && body.github_issue_id.trim().length > 0 ? body.github_issue_id.trim() : undefined,
    vaultRoot,
  });

  if (typeof body.requiredCapability === "string" && body.requiredCapability.trim().length > 0) {
    await writeAuditNote({
      vaultRoot,
      taskId: result.frontmatter.id,
      source: "relayhq-web",
      message: result.frontmatter.assignee === "unassigned"
        ? `auto_route fallback: no eligible agent found for capability ${body.requiredCapability.trim()}`
        : `auto_route selected ${result.frontmatter.assignee} for capability ${body.requiredCapability.trim()}`,
    });
  }

  return {
    taskId: result.frontmatter.id,
    boardId: result.frontmatter.board_id,
    sourcePath: `vault/shared/tasks/${result.frontmatter.id}.md`,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export default defineEventHandler(async (event) => {
  try {
    return await createVaultTaskFromBody(await readBody(event));
  } catch (error) {
    if (error instanceof TaskCreateError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message });
    }

    if (error instanceof VaultSchemaError) {
      throw createError({
        statusCode: 400,
        statusMessage: error.issues.map((issue) => `${issue.field}: ${issue.message}`).join(", "),
      });
    }

    throw error;
  }
});
