import { DEFAULT_STALE_AFTER_MS, getTaskLockState } from "../vault/lock";
import type { TaskFrontmatter } from "../../../shared/vault/schema";

export type RelayHQProtocolCommandName = "tasks" | "claim" | "update" | "heartbeat" | "request-approval" | "schedule";

export interface RelayHQProtocolCommandSpec {
  readonly name: RelayHQProtocolCommandName;
  readonly description: string;
  readonly boundary: "control-plane";
}

export interface RelayHQTaskSelection {
  readonly actorId: string;
  readonly callerId: string;
  readonly assignee: string;
  readonly readyTasks: ReadonlyArray<TaskFrontmatter>;
}

export interface RelayHQTaskIndex {
  readonly byId: ReadonlyMap<string, TaskFrontmatter>;
}

export interface RelayHQTaskSelectionRequest {
  readonly callerId?: string;
  readonly assignee: string;
  readonly tasks: ReadonlyArray<TaskFrontmatter>;
  readonly now?: Date;
  readonly staleAfterMs?: number;
}

const PRIORITY_RANK: Readonly<Record<TaskFrontmatter["priority"], number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const RELAYHQ_PROTOCOL_COMMANDS = [
  {
    name: "tasks",
    description: "List ready tasks assigned to the caller",
    boundary: "control-plane",
  },
  {
    name: "claim",
    description: "Claim a ready task for the caller",
    boundary: "control-plane",
  },
  {
    name: "update",
    description: "Write a status update back to the control plane",
    boundary: "control-plane",
  },
  {
    name: "heartbeat",
    description: "Report liveness for an owned task",
    boundary: "control-plane",
  },
  {
    name: "request-approval",
    description: "Request a human approval gate",
    boundary: "control-plane",
  },
  {
    name: "schedule",
    description: "Defer a task until a future time",
    boundary: "control-plane",
  },
] as const satisfies ReadonlyArray<RelayHQProtocolCommandSpec>;

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function normalizeIdentity(value: string): string {
  return value.trim();
}

function isAlignedCallerAssignee(callerId: string, assignee: string): boolean {
  return normalizeIdentity(callerId).length > 0 && normalizeIdentity(callerId) === normalizeIdentity(assignee);
}

function createTaskIndex(tasks: ReadonlyArray<TaskFrontmatter>): RelayHQTaskIndex {
  return {
    byId: new Map(tasks.map((task) => [task.id, task] as const)),
  };
}

function isTerminalTask(task: TaskFrontmatter): boolean {
  return task.status === "done" || task.status === "cancelled";
}

function isDeferredTask(task: TaskFrontmatter): boolean {
  return task.status === "scheduled";
}

function areDependenciesDone(task: TaskFrontmatter, index: RelayHQTaskIndex): boolean {
  return task.depends_on.every((dependencyId) => index.byId.get(dependencyId)?.status === "done");
}

function compareReadyTasks(left: TaskFrontmatter, right: TaskFrontmatter): number {
  const priorityComparison = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
  if (priorityComparison !== 0) {
    return priorityComparison;
  }

  const createdComparison = compareText(left.created_at, right.created_at);
  if (createdComparison !== 0) {
    return createdComparison;
  }

  return compareText(left.id, right.id);
}

export function isTaskReadyForCaller(
  task: TaskFrontmatter,
  actorId: string,
  index: RelayHQTaskIndex,
  now: Date,
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): boolean {
  const normalizedActorId = normalizeIdentity(actorId);
  const lockState = getTaskLockState(task, now, staleAfterMs);
  const lockIsOwnedByAnotherActor = lockState.owner !== null && normalizeIdentity(lockState.owner) !== normalizedActorId;

  return normalizeIdentity(task.assignee) === normalizedActorId && !isTerminalTask(task) && !isDeferredTask(task) && !lockState.stale && !lockIsOwnedByAnotherActor && areDependenciesDone(task, index);
}

export function selectReadyTasks(
  tasks: ReadonlyArray<TaskFrontmatter>,
  actorId: string,
  now: Date = new Date(),
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): ReadonlyArray<TaskFrontmatter> {
  if (normalizeIdentity(actorId).length === 0) {
    return [];
  }

  const index = createTaskIndex(tasks);

  return [...tasks]
    .filter((task) => isTaskReadyForCaller(task, actorId, index, now, staleAfterMs))
    .sort(compareReadyTasks);
}

export function selectReadyTasksForCaller(request: RelayHQTaskSelectionRequest): ReadonlyArray<TaskFrontmatter> {
  const callerId = request.callerId ?? request.assignee;

  if (!isAlignedCallerAssignee(callerId, request.assignee)) {
    return [];
  }

  return selectReadyTasks(request.tasks, callerId, request.now, request.staleAfterMs);
}

export function buildTaskSelection(
  tasks: ReadonlyArray<TaskFrontmatter>,
  callerId: string,
  now: Date = new Date(),
  assignee: string = callerId,
): RelayHQTaskSelection {
  if (!isAlignedCallerAssignee(callerId, assignee)) {
    return {
      actorId: callerId,
      callerId,
      assignee,
      readyTasks: [],
    };
  }

  return {
    actorId: callerId,
    callerId,
    assignee,
    readyTasks: selectReadyTasks(tasks, callerId, now),
  };
}
