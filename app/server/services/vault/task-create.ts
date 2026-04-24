import { randomUUID } from "node:crypto";

import {
  TASK_COLUMNS,
  TASK_PRIORITIES,
  VAULT_SCHEMA_VERSION,
  type TaskColumn,
  type TaskFrontmatter,
  type TaskPriority,
} from "../../../shared/vault/schema";
import { containsSecretMaterial } from "../security/secrets";
import { readSharedVaultCollections } from "./read";
import { resolveTaskFilePath, resolveVaultWorkspaceRoot } from "./runtime";
import { createTaskDocument, type CreateTaskDocumentResult } from "./write";

const DEFAULT_CREATED_BY = "@relayhq-web" as const;

const TASK_STATUS_BY_COLUMN: Readonly<Record<TaskColumn, TaskFrontmatter["status"]>> = {
  todo: "todo",
  "in-progress": "in-progress",
  review: "waiting-approval",
  done: "done",
} as const;

export interface CreateTaskInput {
  readonly title: string;
  readonly projectId: string;
  readonly boardId: string;
  readonly column: TaskColumn;
  readonly priority: TaskPriority;
  readonly assignee: string;
  readonly tags?: ReadonlyArray<string>;
  readonly dependsOn?: ReadonlyArray<string>;
  readonly body?: string;
  readonly sourceIssueId?: string;
  readonly now?: Date;
  readonly vaultRoot?: string;
}

export class TaskCreateError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "TaskCreateError";
    this.statusCode = statusCode;
  }
}

function normalizeString(value: string, field: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TaskCreateError(400, `${field} is required.`);
  }

  if (containsSecretMaterial(normalized)) {
    throw new TaskCreateError(400, `${field} must not contain raw secrets.`);
  }

  return normalized;
}

function normalizeStringArray(values: ReadonlyArray<string> | undefined, field: string): ReadonlyArray<string> {
  if (values === undefined) {
    return [];
  }

  const normalizedValues = values.map((value) => normalizeString(value, field));
  return [...new Set(normalizedValues)].sort((left, right) => left.localeCompare(right));
}

function assertAllowedColumn(value: string): asserts value is TaskColumn {
  if (!TASK_COLUMNS.includes(value as TaskColumn)) {
    throw new TaskCreateError(400, `column must be one of: ${TASK_COLUMNS.join(", ")}.`);
  }
}

function assertAllowedPriority(value: string): asserts value is TaskPriority {
  if (!TASK_PRIORITIES.includes(value as TaskPriority)) {
    throw new TaskCreateError(400, `priority must be one of: ${TASK_PRIORITIES.join(", ")}.`);
  }
}

function buildTaskFrontmatter(input: {
  readonly id: string;
  readonly now: Date;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly boardId: string;
  readonly column: TaskColumn;
  readonly priority: TaskPriority;
  readonly title: string;
  readonly assignee: string;
  readonly tags: ReadonlyArray<string>;
  readonly dependsOn: ReadonlyArray<string>;
  readonly sourceIssueId: string | null;
}): TaskFrontmatter {
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
    source_issue_id: input.sourceIssueId,
    depends_on: input.dependsOn,
    tags: input.tags,
    links: [],
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
  };
}

export async function createVaultTask(input: CreateTaskInput): Promise<CreateTaskDocumentResult> {
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

  const now = input.now ?? new Date();
  const vaultRoot = input.vaultRoot ?? resolveVaultWorkspaceRoot();
  const collections = await readSharedVaultCollections(vaultRoot);

  const project = collections.projects.find((entry) => entry.frontmatter.id === projectId)?.frontmatter;
  if (project === undefined) {
    throw new TaskCreateError(404, `Project ${projectId} was not found.`);
  }

  const board = collections.boards.find((entry) => entry.frontmatter.id === boardId)?.frontmatter;
  if (board === undefined) {
    throw new TaskCreateError(404, `Board ${boardId} was not found.`);
  }

  if (board.project_id !== project.id) {
    throw new TaskCreateError(400, `Board ${board.id} does not belong to project ${project.id}.`);
  }

  const column = collections.columns.find((entry) => entry.frontmatter.id === columnValue)?.frontmatter;
  if (column === undefined) {
    throw new TaskCreateError(404, `Column ${columnValue} was not found.`);
  }

  if (column.board_id !== board.id || column.project_id !== project.id) {
    throw new TaskCreateError(400, `Column ${column.id} does not belong to board ${board.id}.`);
  }

  for (const dependencyId of dependsOn) {
    const dependencyTask = collections.tasks.find((entry) => entry.frontmatter.id === dependencyId)?.frontmatter;
    if (dependencyTask === undefined) {
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
    dependsOn,
    sourceIssueId: input.sourceIssueId ?? null,
  });

  return await createTaskDocument({
    filePath: resolveTaskFilePath(taskId, vaultRoot),
    frontmatter,
    body: input.body ?? "",
  });
}
