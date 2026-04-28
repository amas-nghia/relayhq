import { randomUUID } from "node:crypto";

import {
  TASK_PRIORITIES,
  VAULT_SCHEMA_VERSION,
  type TaskFrontmatter,
  type TaskPriority,
} from "../../../shared/vault/schema";
import { nextCronOccurrence, validateCronSchedule } from "../../../shared/vault/cron";
import { containsSecretMaterial } from "../security/secrets";
import { publishRealtimeUpdate } from "../realtime/bus";
import { queueTaskWebhookNotification } from "../settings/webhooks";
import { readCanonicalVaultReadModel } from "./read";
import { readSharedVaultCollections } from "./read";
import { resolveTaskFilePath, resolveVaultWorkspaceRoot } from "./runtime";
import { createTaskDocument, type CreateTaskDocumentResult } from "./write";

const DEFAULT_CREATED_BY = "@relayhq-web" as const;

function statusFromColumnPosition(position: number): TaskFrontmatter["status"] {
  if (position === 0) return "todo";
  if (position === 1) return "in-progress";
  if (position === 2) return "review";
  return "done";
}

function isCompletedStatus(status: TaskFrontmatter["status"]): boolean {
  return status === "review" || status === "done";
}

export interface CreateTaskInput {
  readonly title: string;
  readonly projectId: string;
  readonly boardId: string;
  readonly columnId: string;
  readonly priority: TaskPriority;
  readonly assignee?: string;
  readonly requiredCapability?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly dependsOn?: ReadonlyArray<string>;
  readonly body?: string;
  readonly sourceIssueId?: string;
  readonly githubIssueId?: string;
  readonly parentTaskId?: string;
  readonly cronSchedule?: string;
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

export interface AutoAssignmentDecision {
  readonly assignee: string;
  readonly reason: string;
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
  readonly columnId: string;
  readonly columnPosition: number;
  readonly priority: TaskPriority;
  readonly title: string;
  readonly assignee: string;
  readonly tags: ReadonlyArray<string>;
  readonly dependsOn: ReadonlyArray<string>;
  readonly parentTaskId: string | null;
  readonly sourceIssueId: string | null;
  readonly githubIssueId: string | null;
  readonly cronSchedule: string | null;
}): TaskFrontmatter {
  const timestamp = input.now.toISOString();
  const status = statusFromColumnPosition(input.columnPosition);
  const nextRunAt = input.cronSchedule ? nextCronOccurrence(input.cronSchedule, input.now)?.toISOString() ?? null : null;
  const effectiveStatus = input.cronSchedule ? "scheduled" : status;

  return {
    id: input.id,
    type: "task",
    version: VAULT_SCHEMA_VERSION,
    workspace_id: input.workspaceId,
    project_id: input.projectId,
    board_id: input.boardId,
    column: input.columnId,
    status: effectiveStatus,
    priority: input.priority,
    title: input.title,
    assignee: input.assignee,
    created_by: DEFAULT_CREATED_BY,
    created_at: timestamp,
    updated_at: timestamp,
    heartbeat_at: null,
    execution_started_at: null,
    execution_notes: null,
    progress: isCompletedStatus(effectiveStatus) ? 100 : 0,
    history: [{ at: timestamp, actor: DEFAULT_CREATED_BY, action: "created", to_status: effectiveStatus }],
    approval_needed: false,
    dispatch_status: input.assignee === "unassigned" ? "idle" : "checking",
    dispatch_reason: input.assignee === "unassigned" ? null : "Assigned and waiting for dispatcher evaluation.",
    last_dispatch_attempt_at: input.assignee === "unassigned" ? null : timestamp,
    approval_requested_by: null,
    approval_reason: null,
    approved_by: null,
    approved_at: null,
    approval_outcome: "pending",
    blocked_reason: null,
    blocked_since: null,
    result: null,
    completed_at: isCompletedStatus(effectiveStatus) ? timestamp : null,
    parent_task_id: input.parentTaskId,
    source_issue_id: input.sourceIssueId,
    github_issue_id: input.githubIssueId,
    next_run_at: nextRunAt,
    cron_schedule: input.cronSchedule,
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
  const columnId = normalizeString(input.columnId, "columnId");
  const priorityValue = normalizeString(input.priority, "priority");
  const tags = normalizeStringArray(input.tags, "tags");
  const dependsOn = normalizeStringArray(input.dependsOn, "dependsOn");
  const cronSchedule = input.cronSchedule?.trim().length ? normalizeString(input.cronSchedule, "cronSchedule") : null;

  assertAllowedPriority(priorityValue);

  if (cronSchedule !== null) {
    const cronIssue = validateCronSchedule(cronSchedule);
    if (cronIssue !== null) {
      throw new TaskCreateError(400, `cron_schedule ${cronIssue}.`);
    }
  }

  const now = input.now ?? new Date();
  const vaultRoot = input.vaultRoot ?? resolveVaultWorkspaceRoot();
  const collections = await readSharedVaultCollections(vaultRoot);
  const readModel = await readCanonicalVaultReadModel(vaultRoot);

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

  const column = collections.columns.find((entry) => entry.frontmatter.id === columnId)?.frontmatter;
  if (column === undefined) {
    throw new TaskCreateError(404, `Column ${columnId} was not found.`);
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

  let assignee = typeof input.assignee === "string" && input.assignee.trim().length > 0
    ? normalizeString(input.assignee, "assignee")
    : "unassigned";

  if (input.requiredCapability && input.requiredCapability.trim().length > 0) {
    const capability = normalizeString(input.requiredCapability, "requiredCapability");
    const activeLoads = new Map<string, number>();
    for (const task of readModel.tasks) {
      if (task.status === "in-progress" || task.status === "waiting-approval" || task.status === "blocked") {
        activeLoads.set(task.assignee, (activeLoads.get(task.assignee) ?? 0) + 1);
      }
    }

    const eligibleAgents = readModel.agents
      .filter((agent) => agent.capabilities.includes(capability))
      .filter((agent) => agent.status === "available")
      .filter((agent) => {
        const budget = agent.monthlyBudgetUsd;
        if (budget == null) return true;
        const spent = readModel.tasks
          .filter((task) => task.assignee === agent.id)
          .filter((task) => task.status === "done")
          .filter((task) => (task.completedAt ?? "").startsWith(now.toISOString().slice(0, 7)))
          .reduce((sum, task) => sum + (task.costUsd ?? 0), 0);
        return spent < budget;
      })
      .sort((left, right) => (activeLoads.get(left.id) ?? 0) - (activeLoads.get(right.id) ?? 0) || left.id.localeCompare(right.id));

    assignee = eligibleAgents[0]?.id ?? "unassigned";
  }

  const taskId = `task-${randomUUID()}`;
  const frontmatter = buildTaskFrontmatter({
    id: taskId,
    now,
    workspaceId: project.workspace_id,
    projectId: project.id,
    boardId: board.id,
    columnId,
    columnPosition: column.position,
    priority: priorityValue,
    title,
    assignee,
    tags,
    dependsOn,
    parentTaskId: input.parentTaskId ?? null,
    sourceIssueId: input.sourceIssueId ?? null,
    githubIssueId: input.githubIssueId ?? null,
    cronSchedule,
  });

  const result = await createTaskDocument({
    filePath: resolveTaskFilePath(taskId, vaultRoot),
    frontmatter,
    body: input.body ?? "",
  });

  publishRealtimeUpdate({
    kind: "vault.changed",
    reason: "task.created",
    taskId: result.frontmatter.id,
    agentId: result.frontmatter.assignee,
    source: DEFAULT_CREATED_BY,
    timestamp: now.toISOString(),
  });

  queueTaskWebhookNotification({
    event: "task.created",
    taskId: result.frontmatter.id,
    title: result.frontmatter.title,
    status: result.frontmatter.status,
    assignee: result.frontmatter.assignee,
    timestamp: now.toISOString(),
    boardUrl: `${process.env.RELAYHQ_PUBLIC_BASE_URL || "http://127.0.0.1:44211"}/boards/${result.frontmatter.board_id}`,
  }, { vaultRoot });

  return result;
}
