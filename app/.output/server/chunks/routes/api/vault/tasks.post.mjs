import { d as defineEventHandler, r as readBody, c as createError } from '../../../nitro/nitro.mjs';
import { randomUUID } from 'node:crypto';
import { r as resolveVaultWorkspaceRoot, a as resolveTaskFilePath, T as TASK_COLUMNS, b as TASK_PRIORITIES, V as VAULT_SCHEMA_VERSION, c as VaultSchemaError } from '../../../_/runtime.mjs';
import { c as createTaskDocument, a as containsSecretMaterial } from '../../../_/write.mjs';
import { a as readSharedVaultCollections } from '../../../_/read.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:url';
import 'node:fs/promises';

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, key + "" , value);
const DEFAULT_CREATED_BY = "@relayhq-web";
const TASK_STATUS_BY_COLUMN = {
  todo: "todo",
  "in-progress": "in-progress",
  review: "waiting-approval",
  done: "done"
};
class TaskCreateError extends Error {
  constructor(statusCode, message) {
    super(message);
    __publicField(this, "statusCode");
    this.name = "TaskCreateError";
    this.statusCode = statusCode;
  }
}
function normalizeString(value, field) {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TaskCreateError(400, `${field} is required.`);
  }
  if (containsSecretMaterial(normalized)) {
    throw new TaskCreateError(400, `${field} must not contain raw secrets.`);
  }
  return normalized;
}
function normalizeStringArray(values, field) {
  if (values === void 0) {
    return [];
  }
  const normalizedValues = values.map((value) => normalizeString(value, field));
  return [...new Set(normalizedValues)].sort((left, right) => left.localeCompare(right));
}
function assertAllowedColumn(value) {
  if (!TASK_COLUMNS.includes(value)) {
    throw new TaskCreateError(400, `column must be one of: ${TASK_COLUMNS.join(", ")}.`);
  }
}
function assertAllowedPriority(value) {
  if (!TASK_PRIORITIES.includes(value)) {
    throw new TaskCreateError(400, `priority must be one of: ${TASK_PRIORITIES.join(", ")}.`);
  }
}
function buildTaskFrontmatter(input) {
  const timestamp = input.now.toISOString();
  const status = TASK_STATUS_BY_COLUMN[input.column];
  return {
    id: input.id,
    type: "task",
    version: VAULT_SCHEMA_VERSION,
    workspace_id: input.workspaceId,
    project_id: input.projectId,
    board_id: input.boardId,
    column: input.column,
    status,
    priority: input.priority,
    title: input.title,
    assignee: input.assignee,
    created_by: DEFAULT_CREATED_BY,
    created_at: timestamp,
    updated_at: timestamp,
    heartbeat_at: null,
    execution_started_at: null,
    execution_notes: null,
    progress: status === "done" ? 100 : 0,
    approval_needed: false,
    approval_requested_by: null,
    approval_reason: null,
    approved_by: null,
    approved_at: null,
    approval_outcome: "pending",
    blocked_reason: null,
    blocked_since: null,
    result: null,
    completed_at: status === "done" ? timestamp : null,
    parent_task_id: null,
    depends_on: input.dependsOn,
    tags: input.tags,
    links: [],
    locked_by: null,
    locked_at: null,
    lock_expires_at: null
  };
}
async function createVaultTask(input) {
  var _a, _b, _c, _d, _e, _f;
  const title = normalizeString(input.title, "title");
  const projectId = normalizeString(input.projectId, "projectId");
  const boardId = normalizeString(input.boardId, "boardId");
  const assignee = normalizeString(input.assignee, "assignee");
  const columnValue = normalizeString(input.column, "column");
  const priorityValue = normalizeString(input.priority, "priority");
  const tags = normalizeStringArray(input.tags, "tags");
  const dependsOn = normalizeStringArray(input.dependsOn, "dependsOn");
  assertAllowedColumn(columnValue);
  assertAllowedPriority(priorityValue);
  const now = (_a = input.now) != null ? _a : /* @__PURE__ */ new Date();
  const vaultRoot = (_b = input.vaultRoot) != null ? _b : resolveVaultWorkspaceRoot();
  const collections = await readSharedVaultCollections(vaultRoot);
  const project = (_c = collections.projects.find((entry) => entry.frontmatter.id === projectId)) == null ? void 0 : _c.frontmatter;
  if (project === void 0) {
    throw new TaskCreateError(404, `Project ${projectId} was not found.`);
  }
  const board = (_d = collections.boards.find((entry) => entry.frontmatter.id === boardId)) == null ? void 0 : _d.frontmatter;
  if (board === void 0) {
    throw new TaskCreateError(404, `Board ${boardId} was not found.`);
  }
  if (board.project_id !== project.id) {
    throw new TaskCreateError(400, `Board ${board.id} does not belong to project ${project.id}.`);
  }
  const column = (_e = collections.columns.find((entry) => entry.frontmatter.id === columnValue)) == null ? void 0 : _e.frontmatter;
  if (column === void 0) {
    throw new TaskCreateError(404, `Column ${columnValue} was not found.`);
  }
  if (column.board_id !== board.id || column.project_id !== project.id) {
    throw new TaskCreateError(400, `Column ${column.id} does not belong to board ${board.id}.`);
  }
  for (const dependencyId of dependsOn) {
    const dependencyTask = (_f = collections.tasks.find((entry) => entry.frontmatter.id === dependencyId)) == null ? void 0 : _f.frontmatter;
    if (dependencyTask === void 0) {
      throw new TaskCreateError(400, `Dependency task ${dependencyId} was not found.`);
    }
  }
  const taskId = `task-${randomUUID()}`;
  const frontmatter = buildTaskFrontmatter({
    id: taskId,
    now,
    workspaceId: project.workspace_id,
    projectId: project.id,
    boardId: board.id,
    column: columnValue,
    priority: priorityValue,
    title,
    assignee,
    tags,
    dependsOn
  });
  return await createTaskDocument({
    filePath: resolveTaskFilePath(taskId, vaultRoot),
    frontmatter,
    body: ""
  });
}

function isPlainRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
const tasks_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!isPlainRecord(body)) {
    throw createError({ statusCode: 400, statusMessage: "Request body must be an object." });
  }
  const allowedKeys = ["title", "projectId", "boardId", "column", "priority", "assignee", "tags", "dependsOn"];
  const bodyKeys = Object.keys(body);
  const invalidKeys = bodyKeys.filter((key) => !allowedKeys.includes(key));
  if (invalidKeys.length > 0) {
    throw createError({ statusCode: 400, statusMessage: `Unsupported task create fields: ${invalidKeys.join(", ")}.` });
  }
  if (typeof body.title !== "string" || typeof body.projectId !== "string" || typeof body.boardId !== "string" || typeof body.column !== "string" || typeof body.priority !== "string" || typeof body.assignee !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "title, projectId, boardId, column, priority, and assignee are required."
    });
  }
  if (body.tags !== void 0 && !isStringArray(body.tags) || body.dependsOn !== void 0 && !isStringArray(body.dependsOn)) {
    throw createError({ statusCode: 400, statusMessage: "tags and dependsOn must be string arrays when provided." });
  }
  try {
    const result = await createVaultTask({
      title: body.title,
      projectId: body.projectId,
      boardId: body.boardId,
      column: body.column,
      priority: body.priority,
      assignee: body.assignee,
      tags: body.tags,
      dependsOn: body.dependsOn
    });
    return {
      taskId: result.frontmatter.id,
      boardId: result.frontmatter.board_id,
      sourcePath: `vault/shared/tasks/${result.frontmatter.id}.md`
    };
  } catch (error) {
    if (error instanceof TaskCreateError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message });
    }
    if (error instanceof VaultSchemaError) {
      throw createError({
        statusCode: 400,
        statusMessage: error.issues.map((issue) => `${issue.field}: ${issue.message}`).join(", ")
      });
    }
    throw error;
  }
});

export { tasks_post as default };
//# sourceMappingURL=tasks.post.mjs.map
