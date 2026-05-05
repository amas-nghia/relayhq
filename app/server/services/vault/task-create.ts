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
import { assertWorkPolicy, findPolicyAgent, isCoordinatorAgent } from "../policy/work-policy";
import { readCanonicalVaultReadModel } from "./read";
import { readSharedVaultCollections } from "./read";
import { resolveTaskFilePath, resolveVaultWorkspaceRoot } from "./runtime";
import { createTaskDocument, type CreateTaskDocumentResult } from "./write";
import { DEFAULT_TASK_ROUTING_CONFIG, expandRoutingTags, readTaskRoutingConfig, type TaskRoutingConfig } from "../settings/task-routing";

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

export interface AutoAssignmentContext {
  readonly projectId: string;
  readonly assignee?: string | null;
  readonly requiredCapability?: string | null;
  readonly tags?: ReadonlyArray<string>;
}

function buildActiveLoads(readModel: Awaited<ReturnType<typeof readCanonicalVaultReadModel>>): Map<string, number> {
  const activeLoads = new Map<string, number>();
  for (const task of readModel.tasks) {
    if (task.status === "in-progress" || task.status === "waiting-approval" || task.status === "blocked") {
      activeLoads.set(task.assignee, (activeLoads.get(task.assignee) ?? 0) + 1);
    }
  }
  return activeLoads;
}

function isAgentWithinBudget(
  agent: Awaited<ReturnType<typeof readCanonicalVaultReadModel>>["agents"][number],
  readModel: Awaited<ReturnType<typeof readCanonicalVaultReadModel>>,
  now: Date,
): boolean {
  const budget = agent.monthlyBudgetUsd;
  if (budget == null) return true;
  const spent = readModel.tasks
    .filter((task) => task.assignee === agent.id)
    .filter((task) => task.status === "done")
    .filter((task) => (task.completedAt ?? "").startsWith(now.toISOString().slice(0, 7)))
    .reduce((sum, task) => sum + (task.costUsd ?? 0), 0);
  return spent < budget;
}

function selectAgentByCapability(
  capability: string,
  readModel: Awaited<ReturnType<typeof readCanonicalVaultReadModel>>,
  now: Date,
): string {
  const activeLoads = buildActiveLoads(readModel);
  const eligibleAgents = readModel.agents
    .filter((agent) => agent.capabilities.includes(capability))
    .filter((agent) => agent.status === "available")
    .filter((agent) => !isCoordinatorAgent(agent))
    .filter((agent) => isAgentWithinBudget(agent, readModel, now))
    .sort((left, right) => (activeLoads.get(left.id) ?? 0) - (activeLoads.get(right.id) ?? 0) || left.id.localeCompare(right.id));

  return eligibleAgents[0]?.id ?? "unassigned";
}

function selectAgentByTags(
  projectId: string,
  tags: ReadonlyArray<string>,
  readModel: Awaited<ReturnType<typeof readCanonicalVaultReadModel>>,
  now: Date,
): string {
  const taskTags = new Set(tags.map((tag) => tag.toLowerCase()));
  const activeLoads = buildActiveLoads(readModel);

  const scored = readModel.agents
    .filter((agent) => agent.status === "available")
    .filter((agent) => !isCoordinatorAgent(agent))
    .filter((agent) => isAgentWithinBudget(agent, readModel, now))
    .map((agent) => {
      let score = 0;
      if (agent.projectId === projectId) score += 3;
      for (const type of agent.taskTypesAccepted) {
        if (taskTags.has(type.toLowerCase())) score += 2;
      }
      for (const cap of agent.capabilities) {
        if (taskTags.has(cap.toLowerCase())) score += 1;
      }
      return { agent, score, load: activeLoads.get(agent.id) ?? 0 };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.load - right.load || left.agent.id.localeCompare(right.agent.id));

  return scored[0]?.agent.id ?? "unassigned";
}

export function decideAutoAssignment(
  context: AutoAssignmentContext,
  readModel: Awaited<ReturnType<typeof readCanonicalVaultReadModel>>,
  now: Date,
  routingConfig: TaskRoutingConfig = DEFAULT_TASK_ROUTING_CONFIG,
): AutoAssignmentDecision | null {
  const explicitAssignee = typeof context.assignee === "string" && context.assignee.trim().length > 0
    ? context.assignee.trim()
    : null;
  if (explicitAssignee !== null && explicitAssignee !== "unassigned") return null;

  const requiredCapability = typeof context.requiredCapability === "string" && context.requiredCapability.trim().length > 0
    ? context.requiredCapability.trim()
    : null;
  if (requiredCapability !== null) {
    const assignee = selectAgentByCapability(requiredCapability, readModel, now);
    return {
      assignee,
      reason: assignee === "unassigned"
        ? `No eligible agent found for capability ${requiredCapability}.`
        : `Auto-assigned from required capability ${requiredCapability}.`,
    };
  }

  const tags = (context.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  if (tags.length === 0) return null;
  const assignee = selectAgentByTags(context.projectId, [...expandRoutingTags(tags, routingConfig)], readModel, now);
  return {
    assignee,
    reason: assignee === "unassigned"
      ? `No eligible agent found for tags: ${tags.join(", ")}.`
      : `Auto-assigned from routing tags: ${tags.join(", ")}.`,
  };
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
  const routingConfig = await readTaskRoutingConfig(vaultRoot);

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

  const autoAssignment = decideAutoAssignment({
    projectId: project.id,
    assignee,
    requiredCapability: input.requiredCapability ?? null,
    tags,
  }, readModel, now, routingConfig);
  if (autoAssignment !== null) {
    assignee = autoAssignment.assignee;
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

  if (assignee !== "unassigned") {
    assertWorkPolicy({
      actorId: DEFAULT_CREATED_BY,
      action: "assign",
      readModel,
      task: {
        id: frontmatter.id,
        tags: frontmatter.tags,
        status: frontmatter.status,
        assignee: frontmatter.assignee,
        approvalNeeded: frontmatter.approval_needed,
        approvalOutcome: frontmatter.approval_outcome,
      },
      assigneeId: assignee,
      assignee: findPolicyAgent(readModel, assignee),
    })
  }

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
