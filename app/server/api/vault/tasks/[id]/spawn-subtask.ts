import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import type { TaskPriority } from "../../../../shared/vault/schema";
import { readCanonicalVaultReadModel } from "../../../../services/vault/read";
import { formatTaskInputIssues, validateTaskInput } from "../../../../services/vault/task-input";
import { createVaultTask, TaskCreateError } from "../../../../services/vault/task-create";
import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";
import { buildBody } from "../../tasks.post";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export async function spawnSubtaskFromBody(taskId: string, body: unknown, options: { vaultRoot?: string } = {}) {
  if (!isPlainRecord(body) || typeof body.title !== "string") {
    throw createError({ statusCode: 400, statusMessage: "title is required." });
  }

  if (
    (body.acceptanceCriteria !== undefined && !isStringArray(body.acceptanceCriteria))
    || (body.constraints !== undefined && !isStringArray(body.constraints))
    || (body.contextFiles !== undefined && !isStringArray(body.contextFiles))
    || (body.tags !== undefined && !isStringArray(body.tags))
    || (body.dependsOn !== undefined && !isStringArray(body.dependsOn))
  ) {
    throw createError({ statusCode: 400, statusMessage: "acceptanceCriteria, constraints, contextFiles, tags, and dependsOn must be string arrays when provided." });
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

  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const parent = readModel.tasks.find((entry) => entry.id === taskId);
  if (!parent) {
    throw createError({ statusCode: 404, statusMessage: `Task ${taskId} was not found.` });
  }

  const boardColumns = readModel.columns
    .filter((entry) => entry.boardId === parent.boardId)
    .sort((left, right) => left.position - right.position);
  const targetColumn = boardColumns[0];
  if (!targetColumn) {
    throw createError({ statusCode: 400, statusMessage: `Board ${parent.boardId} has no columns.` });
  }

  const result = await createVaultTask({
    title: body.title,
    projectId: parent.projectId,
    boardId: parent.boardId,
    columnId: targetColumn.id,
    priority: (typeof body.priority === "string" ? body.priority : parent.priority) as TaskPriority,
    assignee: typeof body.assignee === "string" ? body.assignee : undefined,
    requiredCapability: typeof body.requiredCapability === "string" ? body.requiredCapability : undefined,
    tags: body.tags,
    dependsOn: body.dependsOn,
    parentTaskId: parent.id,
    body: buildBody(
      typeof body.objective === "string" ? body.objective : undefined,
      body.acceptanceCriteria,
      body.constraints,
      body.contextFiles,
    ),
    vaultRoot,
  });

  return {
    taskId: result.frontmatter.id,
    parentTaskId: parent.id,
    boardId: result.frontmatter.board_id,
    sourcePath: `vault/shared/tasks/${result.frontmatter.id}.md`,
  };
}

export default defineEventHandler(async (event) => {
  assertMethod(event, "POST");
  const taskId = getRouterParam(event, "id");
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  try {
    return await spawnSubtaskFromBody(taskId, await readBody(event));
  } catch (error) {
    if (error instanceof TaskCreateError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message });
    }
    throw error;
  }
});
