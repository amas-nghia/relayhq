import type { TaskFrontmatter } from "./repository";
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

function withLifecycleDefaults(
  patch: Readonly<Partial<TaskFrontmatter>>,
  current: TaskFrontmatter,
  now: Date,
): Readonly<Partial<TaskFrontmatter>> {
  const next: Partial<TaskFrontmatter> = { ...patch };

  if (next.status === "done" && next.completed_at === undefined) {
    return { ...next, completed_at: now.toISOString() };
  }

  if (next.status !== undefined && next.status !== "done" && next.completed_at === undefined) {
    return { ...next, completed_at: null };
  }

  if (next.status === "blocked" && next.blocked_since === undefined) {
    return { ...next, blocked_since: now.toISOString() };
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
  options: { recoverStaleLock?: boolean } = {},
): Promise<SyncTaskResult> {
  const now = request.now ?? new Date();
  const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();

  return await syncTaskDocument({
    filePath: resolveTaskFilePath(request.taskId, vaultRoot),
    actorId: request.actorId,
    now,
    recoverStaleLock: options.recoverStaleLock,
    mutate: (task) => withLifecycleDefaults(mutate(task, now), task, now),
  });
}

export async function patchTaskLifecycle(request: PatchTaskLifecycleRequest): Promise<SyncTaskResult> {
  return await runTaskLifecycleMutation(request, () => request.patch);
}

export async function claimTaskLifecycle(request: ClaimTaskLifecycleRequest): Promise<SyncTaskResult> {
  return await runTaskLifecycleMutation(request, (_task, now) => ({
    assignee: request.assignee ?? request.actorId,
    status: "in-progress",
    column: "in-progress",
    execution_started_at: now.toISOString(),
    blocked_reason: null,
    blocked_since: null,
  }), { recoverStaleLock: true });
}

export async function heartbeatTaskLifecycle(request: TaskLifecycleRequest): Promise<SyncTaskResult> {
  return await runTaskLifecycleMutation(request, () => ({}));
}

export async function requestTaskApprovalLifecycle(request: RequestApprovalLifecycleRequest): Promise<SyncTaskResult> {
  const result = await runTaskLifecycleMutation(request, () => ({
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
    vaultRoot: request.vaultRoot ?? resolveVaultWorkspaceRoot(),
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

  return result;
}

export async function approveTaskLifecycle(request: TaskLifecycleRequest): Promise<SyncTaskResult> {
  const result = await runTaskLifecycleMutation(request, (_task, now) => ({
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
    vaultRoot: request.vaultRoot ?? resolveVaultWorkspaceRoot(),
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

  return result;
}

export async function rejectTaskLifecycle(request: RejectTaskLifecycleRequest): Promise<SyncTaskResult> {
  const result = await runTaskLifecycleMutation(request, (_task, now) => ({
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
    vaultRoot: request.vaultRoot ?? resolveVaultWorkspaceRoot(),
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

  return result;
}
