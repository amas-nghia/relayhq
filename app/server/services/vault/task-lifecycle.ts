import type { TaskFrontmatter } from "./repository";
import { queueTaskWebhookNotification, type WebhookEvent } from "../settings/webhooks";
import { publishRealtimeUpdate } from "../realtime/bus";
import { upsertLatestApprovalForTask } from "./approval-write";
import { syncTaskDocument, type SyncTaskResult } from "./write";
import { resolveTaskFilePath, resolveVaultWorkspaceRoot } from "./runtime";

export interface TaskLifecycleRequest {
  readonly taskId: string;
  readonly actorId: string;
  readonly now?: Date;
  readonly vaultRoot?: string;
}

export interface PatchTaskLifecycleRequest extends TaskLifecycleRequest {
  readonly patch: Readonly<Partial<TaskFrontmatter>>;
}

export interface ClaimTaskLifecycleRequest extends TaskLifecycleRequest {
  readonly assignee?: string;
}

export interface RequestApprovalLifecycleRequest extends TaskLifecycleRequest {
  readonly reason: string;
}

export interface RejectTaskLifecycleRequest extends RequestApprovalLifecycleRequest {}

export interface ScheduleTaskLifecycleRequest extends TaskLifecycleRequest {
  readonly nextRunAt: string;
}

function isCompletedStatus(status: TaskFrontmatter["status"]): boolean {
  return status === "review" || status === "done";
}

function withLifecycleDefaults(
  patch: Readonly<Partial<TaskFrontmatter>>,
  current: TaskFrontmatter,
  now: Date,
): Readonly<Partial<TaskFrontmatter>> {
  const next: Partial<TaskFrontmatter> = { ...patch };

  if (next.status !== undefined && isCompletedStatus(next.status) && next.completed_at === undefined) {
    return { ...next, completed_at: now.toISOString() };
  }

  if (next.status === "blocked" && next.blocked_since === undefined) {
    return { ...next, completed_at: null, blocked_since: now.toISOString(), blocked_reason: next.blocked_reason ?? null };
  }

  if (next.status !== undefined && !isCompletedStatus(next.status) && next.completed_at === undefined) {
    return { ...next, completed_at: null };
  }

  if (next.status !== undefined && next.status !== "blocked" && next.blocked_since === undefined) {
    return {
      ...next,
      blocked_since: null,
      blocked_reason: next.blocked_reason ?? null,
    };
  }

  if (next.execution_started_at === undefined && current.execution_started_at !== null && next.status === "in-progress") {
    return { ...next, execution_started_at: current.execution_started_at };
  }

  return next;
}

async function runTaskLifecycleMutation(
  request: TaskLifecycleRequest,
  mutate: (task: TaskFrontmatter, now: Date) => Readonly<Partial<TaskFrontmatter>>,
  options: { recoverStaleLock?: boolean; releaseLock?: boolean } = {},
): Promise<SyncTaskResult> {
  const now = request.now ?? new Date();
  const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();

  return await syncTaskDocument({
    filePath: resolveTaskFilePath(request.taskId, vaultRoot),
    actorId: request.actorId,
    now,
    recoverStaleLock: options.recoverStaleLock,
    releaseLock: options.releaseLock,
    mutate: (task) => withLifecycleDefaults(mutate(task, now), task, now),
  });
}

function toWebhookEvent(previous: TaskFrontmatter, next: TaskFrontmatter): WebhookEvent | null {
  if (previous.approval_outcome !== next.approval_outcome) {
    if (next.approval_outcome === "approved") return "task.approved";
    if (next.approval_outcome === "rejected") return "task.rejected";
  }

  if (previous.status === next.status) {
    if (
      previous.title !== next.title
      || previous.assignee !== next.assignee
      || previous.column !== next.column
      || previous.priority !== next.priority
      || previous.execution_started_at !== next.execution_started_at
      || previous.heartbeat_at !== next.heartbeat_at
      || previous.execution_notes !== next.execution_notes
      || previous.progress !== next.progress
      || previous.approval_needed !== next.approval_needed
      || previous.approval_requested_by !== next.approval_requested_by
      || previous.approval_reason !== next.approval_reason
      || previous.approved_by !== next.approved_by
      || previous.approved_at !== next.approved_at
      || previous.blocked_reason !== next.blocked_reason
      || previous.blocked_since !== next.blocked_since
      || previous.result !== next.result
      || previous.completed_at !== next.completed_at
      || previous.parent_task_id !== next.parent_task_id
      || previous.next_run_at !== next.next_run_at
      || JSON.stringify(previous.depends_on) !== JSON.stringify(next.depends_on)
      || JSON.stringify(previous.tags) !== JSON.stringify(next.tags)
      || JSON.stringify(previous.links) !== JSON.stringify(next.links)
      || previous.locked_by !== next.locked_by
      || previous.locked_at !== next.locked_at
      || previous.lock_expires_at !== next.lock_expires_at
    ) {
      return "task.updated";
    }

    return null;
  }

  if (next.status === "in-progress") return "task.claimed";
  if (next.status === "review") return "task.review";
  if (next.status === "done") return "task.done";
  if (next.status === "blocked") return "task.blocked";
  if (next.status === "waiting-approval") return "task.waiting-approval";
  return null;
}

function notifyTaskLifecycle(previous: TaskFrontmatter, next: TaskFrontmatter, timestamp: string, vaultRoot: string): WebhookEvent | null {
  const event = toWebhookEvent(previous, next);
  if (event === null) return null;

  queueTaskWebhookNotification({
    event,
    taskId: next.id,
    title: next.title,
    status: next.status,
    assignee: next.assignee,
    timestamp,
    boardUrl: `${process.env.RELAYHQ_PUBLIC_BASE_URL || "http://127.0.0.1:44211"}/boards/${next.board_id}`,
  }, { vaultRoot });

  return event;
}

function publishTaskRealtimeUpdate(next: TaskFrontmatter, timestamp: string, reason: string): void {
  publishRealtimeUpdate({
    kind: "vault.changed",
    reason,
    taskId: next.id,
    agentId: next.assignee,
    source: next.assignee,
    timestamp,
  });
}

export async function patchTaskLifecycle(request: PatchTaskLifecycleRequest): Promise<SyncTaskResult> {
  const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();
  const timestamp = request.now?.toISOString() ?? new Date().toISOString();
  const result = await runTaskLifecycleMutation({ ...request, vaultRoot }, () => request.patch);
  const reason = notifyTaskLifecycle(result.previous, result.frontmatter, timestamp, vaultRoot) ?? "task.updated";
  publishTaskRealtimeUpdate(result.frontmatter, timestamp, reason);
  return result;
}

export async function claimTaskLifecycle(request: ClaimTaskLifecycleRequest): Promise<SyncTaskResult> {
  const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();
  const timestamp = request.now?.toISOString() ?? new Date().toISOString();
  const result = await runTaskLifecycleMutation({ ...request, vaultRoot }, (_task, now) => ({
    assignee: request.assignee ?? request.actorId,
    status: "in-progress",
    column: "in-progress",
    execution_started_at: now.toISOString(),
    next_run_at: null,
    blocked_reason: null,
    blocked_since: null,
  }), { recoverStaleLock: true });
  const reason = notifyTaskLifecycle(result.previous, result.frontmatter, timestamp, vaultRoot) ?? "task.claimed";
  publishTaskRealtimeUpdate(result.frontmatter, timestamp, reason);
  return result;
}

export async function heartbeatTaskLifecycle(request: TaskLifecycleRequest): Promise<SyncTaskResult> {
  const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();
  const timestamp = request.now?.toISOString() ?? new Date().toISOString();
  const result = await runTaskLifecycleMutation({ ...request, vaultRoot }, () => ({}));
  const reason = notifyTaskLifecycle(result.previous, result.frontmatter, timestamp, vaultRoot) ?? "task.heartbeat";
  publishTaskRealtimeUpdate(result.frontmatter, timestamp, reason);
  return result;
}

export async function scheduleTaskLifecycle(request: ScheduleTaskLifecycleRequest): Promise<SyncTaskResult> {
  const timestamp = request.now?.toISOString() ?? new Date().toISOString();
  const result = await runTaskLifecycleMutation(request, () => ({
    status: "scheduled",
    column: "todo",
    next_run_at: request.nextRunAt,
    blocked_reason: null,
    blocked_since: null,
  }), { recoverStaleLock: true, releaseLock: true });
  queueTaskWebhookNotification({
    event: "task.scheduled",
    taskId: result.frontmatter.id,
    title: result.frontmatter.title,
    status: result.frontmatter.status,
    assignee: result.frontmatter.assignee,
    timestamp,
    boardUrl: `${process.env.RELAYHQ_PUBLIC_BASE_URL || "http://127.0.0.1:44211"}/boards/${result.frontmatter.board_id}`,
  }, { vaultRoot: request.vaultRoot ?? resolveVaultWorkspaceRoot() });
  publishTaskRealtimeUpdate(result.frontmatter, timestamp, "task.scheduled");
  return result;
}

export async function requestTaskApprovalLifecycle(request: RequestApprovalLifecycleRequest): Promise<SyncTaskResult> {
  const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();
  const timestamp = request.now?.toISOString() ?? new Date().toISOString();
  const result = await runTaskLifecycleMutation({ ...request, vaultRoot }, () => ({
    status: "waiting-approval",
    column: "review",
    approval_needed: true,
    approval_requested_by: request.actorId,
    approval_reason: request.reason,
    approval_outcome: "pending",
    approved_by: null,
    approved_at: null,
  }));

  await upsertLatestApprovalForTask({
    vaultRoot,
    taskId: result.frontmatter.id,
    workspaceId: result.frontmatter.workspace_id,
    projectId: result.frontmatter.project_id,
    boardId: result.frontmatter.board_id,
    actorId: request.actorId,
    reason: request.reason,
    outcome: "pending",
    status: "requested",
    now: request.now ?? new Date(),
  });

  const reason = notifyTaskLifecycle(result.previous, result.frontmatter, timestamp, vaultRoot) ?? "task.waiting-approval";
  publishTaskRealtimeUpdate(result.frontmatter, timestamp, reason);

  return result;
}

export async function approveTaskLifecycle(request: TaskLifecycleRequest): Promise<SyncTaskResult> {
  const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();
  const timestamp = request.now?.toISOString() ?? new Date().toISOString();
  const result = await runTaskLifecycleMutation({ ...request, vaultRoot }, (_task, now) => ({
    status: "in-progress",
    column: "in-progress",
    approval_needed: true,
    approval_outcome: "approved",
    approved_by: request.actorId,
    approved_at: now.toISOString(),
    blocked_reason: null,
    blocked_since: null,
  }));

  await upsertLatestApprovalForTask({
    vaultRoot,
    taskId: result.frontmatter.id,
    workspaceId: result.frontmatter.workspace_id,
    projectId: result.frontmatter.project_id,
    boardId: result.frontmatter.board_id,
    actorId: request.actorId,
    reason: result.frontmatter.approval_reason,
    outcome: "approved",
    status: "approved",
    now: request.now ?? new Date(),
  });

  const reason = notifyTaskLifecycle(result.previous, result.frontmatter, timestamp, vaultRoot) ?? "task.approved";
  publishTaskRealtimeUpdate(result.frontmatter, timestamp, reason);

  return result;
}

export async function rejectTaskLifecycle(request: RejectTaskLifecycleRequest): Promise<SyncTaskResult> {
  const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();
  const timestamp = request.now?.toISOString() ?? new Date().toISOString();
  const result = await runTaskLifecycleMutation({ ...request, vaultRoot }, (_task, now) => ({
    status: "blocked",
    column: "review",
    approval_needed: true,
    approval_outcome: "rejected",
    approved_by: request.actorId,
    approved_at: now.toISOString(),
    blocked_reason: request.reason,
    blocked_since: now.toISOString(),
  }));

  await upsertLatestApprovalForTask({
    vaultRoot,
    taskId: result.frontmatter.id,
    workspaceId: result.frontmatter.workspace_id,
    projectId: result.frontmatter.project_id,
    boardId: result.frontmatter.board_id,
    actorId: request.actorId,
    reason: request.reason,
    outcome: "rejected",
    status: "rejected",
    now: request.now ?? new Date(),
  });

  const reason = notifyTaskLifecycle(result.previous, result.frontmatter, timestamp, vaultRoot) ?? "task.rejected";
  publishTaskRealtimeUpdate(result.frontmatter, timestamp, reason);

  return result;
}
