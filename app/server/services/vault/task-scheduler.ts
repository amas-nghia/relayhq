import { randomUUID } from "node:crypto";

import { nextCronOccurrence } from "../../../shared/vault/cron";
import type { TaskFrontmatter } from "./repository";
import { writeAuditNote } from "./audit-write";
import { readSharedVaultCollections } from "./read";
import { resolveVaultWorkspaceRoot } from "./runtime";
import { createTaskDocument, syncTaskDocument } from "./write";
import { publishRealtimeUpdate } from "../realtime/bus";

const DEFAULT_SCHEDULER_ACTOR_ID = "relayhq-scheduler" as const;

export interface ReleaseDueScheduledTasksRequest {
  readonly now?: Date;
  readonly vaultRoot?: string;
  readonly actorId?: string;
}

export interface ReleasedScheduledTask {
  readonly taskId: string;
  readonly previousNextRunAt: string;
}

export interface ReleaseDueScheduledTasksResult {
  readonly released: ReadonlyArray<ReleasedScheduledTask>;
}

export interface SpawnRecurringTaskRequest {
  readonly completedTask: TaskFrontmatter;
  readonly completedBody: string;
  readonly actorId?: string;
  readonly now?: Date;
  readonly vaultRoot?: string;
}

export interface SpawnRecurringTaskResult {
  readonly taskId: string;
  readonly nextRunAt: string;
}

function isDueScheduledTask(task: { readonly status: string; readonly next_run_at?: string | null }, now: Date): task is { readonly id: string; readonly next_run_at: string } & typeof task {
  return task.status === "scheduled"
    && typeof task.next_run_at === "string"
    && task.next_run_at.trim().length > 0
    && !Number.isNaN(Date.parse(task.next_run_at))
    && Date.parse(task.next_run_at) <= now.getTime();
}

export async function releaseDueScheduledTasks(request: ReleaseDueScheduledTasksRequest = {}): Promise<ReleaseDueScheduledTasksResult> {
  const now = request.now ?? new Date();
  const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();
  const actorId = request.actorId ?? DEFAULT_SCHEDULER_ACTOR_ID;
  const collections = await readSharedVaultCollections(vaultRoot);
  const dueTasks = collections.tasks.map((entry) => entry.frontmatter).filter((task) => isDueScheduledTask(task, now));
  const released: ReleasedScheduledTask[] = [];

  for (const task of dueTasks) {
    await syncTaskDocument({
      filePath: `${vaultRoot}/vault/shared/tasks/${task.id}.md`,
      actorId,
      now,
      recoverStaleLock: true,
      releaseLock: true,
      mutate: () => ({
        status: "todo",
        column: "todo",
        next_run_at: null,
        blocked_reason: null,
        blocked_since: null,
      }),
    });

    await writeAuditNote({
      vaultRoot,
      taskId: task.id,
      source: actorId,
      message: `scheduled task re-queued after ${task.next_run_at}`,
      now,
    });

    released.push({ taskId: task.id, previousNextRunAt: task.next_run_at });
  }

  return { released };
}

export async function spawnRecurringTaskInstance(request: SpawnRecurringTaskRequest): Promise<SpawnRecurringTaskResult | null> {
  const cronSchedule = request.completedTask.cron_schedule;
  if (typeof cronSchedule !== "string" || cronSchedule.trim().length === 0) {
    return null;
  }

  const now = request.now ?? new Date();
  const baseTime = request.completedTask.completed_at && !Number.isNaN(Date.parse(request.completedTask.completed_at))
    ? new Date(request.completedTask.completed_at)
    : now;
  const nextRunAt = nextCronOccurrence(cronSchedule, baseTime) ?? nextCronOccurrence(cronSchedule, now);
  if (!nextRunAt) {
    return null;
  }

  const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();
  const actorId = request.actorId ?? DEFAULT_SCHEDULER_ACTOR_ID;
  const taskId = `task-${randomUUID()}`;
  const rootTaskId = request.completedTask.parent_task_id ?? request.completedTask.id;
  const timestamp = now.toISOString();

  await createTaskDocument({
    filePath: `${vaultRoot}/vault/shared/tasks/${taskId}.md`,
    frontmatter: {
      ...request.completedTask,
      id: taskId,
      status: "scheduled",
      column: "todo",
      created_by: actorId,
      created_at: timestamp,
      updated_at: timestamp,
      heartbeat_at: null,
      execution_started_at: null,
      execution_notes: null,
      progress: 0,
      history: [{ at: timestamp, actor: actorId, action: "created", to_status: "scheduled" }],
      next_run_at: nextRunAt.toISOString(),
      approval_needed: false,
      approval_requested_by: null,
      approval_reason: null,
      approved_by: null,
      approved_at: null,
      approval_outcome: "pending",
      blocked_reason: null,
      blocked_since: null,
      result: null,
      completed_at: null,
      parent_task_id: rootTaskId,
      cron_schedule: cronSchedule,
      locked_by: null,
      locked_at: null,
      lock_expires_at: null,
    },
    body: request.completedBody,
  });

  await writeAuditNote({
    vaultRoot,
    taskId: rootTaskId,
    source: actorId,
    message: `recurring task spawned next run at ${nextRunAt.toISOString()}`,
    now,
  });

  publishRealtimeUpdate({
    kind: "vault.changed",
    reason: "task.created",
    taskId,
    agentId: request.completedTask.assignee,
    source: actorId,
    timestamp,
  });

  return { taskId, nextRunAt: nextRunAt.toISOString() };
}
