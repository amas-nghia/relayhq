import { createError, defineEventHandler, readBody } from "h3";

import type { TaskColumn, TaskPriority } from "../../../shared/vault/schema";
import { VaultSchemaError } from "../../services/vault/write";
import { createVaultTask, TaskCreateError } from "../../services/vault/task-create";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!isPlainRecord(body)) {
    throw createError({ statusCode: 400, statusMessage: "Request body must be an object." });
  }

  const allowedKeys = ["title", "projectId", "boardId", "column", "priority", "assignee", "tags", "dependsOn"] as const;
  const bodyKeys = Object.keys(body);
  const invalidKeys = bodyKeys.filter((key) => !allowedKeys.includes(key as (typeof allowedKeys)[number]));

  if (invalidKeys.length > 0) {
    throw createError({ statusCode: 400, statusMessage: `Unsupported task create fields: ${invalidKeys.join(", ")}.` });
  }

  if (
    typeof body.title !== "string" ||
    typeof body.projectId !== "string" ||
    typeof body.boardId !== "string" ||
    typeof body.column !== "string" ||
    typeof body.priority !== "string" ||
    typeof body.assignee !== "string"
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: "title, projectId, boardId, column, priority, and assignee are required.",
    });
  }

  if ((body.tags !== undefined && !isStringArray(body.tags)) || (body.dependsOn !== undefined && !isStringArray(body.dependsOn))) {
    throw createError({ statusCode: 400, statusMessage: "tags and dependsOn must be string arrays when provided." });
  }

  try {
    const result = await createVaultTask({
      title: body.title,
      projectId: body.projectId,
      boardId: body.boardId,
      column: body.column as TaskColumn,
      priority: body.priority as TaskPriority,
      assignee: body.assignee,
      tags: body.tags,
      dependsOn: body.dependsOn,
    });

    return {
      taskId: result.frontmatter.id,
      boardId: result.frontmatter.board_id,
      sourcePath: `vault/shared/tasks/${result.frontmatter.id}.md`,
    };
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
