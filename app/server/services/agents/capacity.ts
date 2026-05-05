import { createError } from "h3";

import type { ReadModelTask, VaultReadModel } from "../../models/read-model";
import { agentRunnerManager, DEFAULT_RUNNER_STALE_AFTER_MS, isRunnerSessionLive, type AgentRunnerSummary } from "../runners/manager";

export const DEFAULT_MAX_CONCURRENT_RUNTIME_INSTANCES = 5;
const RUNTIME_CAPACITY_ENV_KEY = "RELAYHQ_MAX_CONCURRENT_RUNTIME_INSTANCES";

export interface RuntimeCapacityBlocker {
  readonly reason: string;
  readonly activeTask: ReadModelTask | null;
  readonly activeSession: AgentRunnerSummary | null;
}

export interface RuntimeCapacitySnapshot {
  readonly maxConcurrentRuntimeInstances: number;
  readonly activeRuntimeInstances: number;
  readonly availableRuntimeSlots: number;
  readonly capacityBlockedTaskCount: number;
}

type ActiveSessionsReader = () => ReadonlyArray<AgentRunnerSummary>;

const guardedRuntimeCapacityClaims: { current: Promise<void> | null } = { current: null };

function parseMaxConcurrentRuntimeInstances(raw: string | undefined): number {
  const parsed = Number.parseInt(raw?.trim() ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MAX_CONCURRENT_RUNTIME_INSTANCES;
  }
  return parsed;
}

function isLiveRuntimeSession(session: AgentRunnerSummary): boolean {
  return isRunnerSessionLive(session, Date.now(), DEFAULT_RUNNER_STALE_AFTER_MS);
}

function getLiveRuntimeSessions(activeSessionsReader?: ActiveSessionsReader): ReadonlyArray<AgentRunnerSummary> {
  const readSessions = activeSessionsReader ?? agentRunnerManager.getRunners.bind(agentRunnerManager);
  return readSessions().filter(isLiveRuntimeSession);
}

function countCapacityBlockedTasks(readModel: VaultReadModel): number {
  return readModel.tasks.filter((task) => isRuntimeCapacityReason(task.dispatchReason)).length;
}

function createTaskSessionReason(taskId: string, session: AgentRunnerSummary): string {
  return `Task ${taskId} already has an active runtime session (${session.status}); wait for that session to finish before launching another.`;
}

function createCapacityReason(active: number, limit: number): string {
  return `Runtime capacity exhausted (${active}/${limit} slots in use). Task queued until a runtime slot is free.`;
}

export function readConfiguredMaxConcurrentRuntimeInstances(env: NodeJS.ProcessEnv = process.env): number {
  return parseMaxConcurrentRuntimeInstances(env[RUNTIME_CAPACITY_ENV_KEY]);
}

export function isRuntimeCapacityReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return reason.includes("Runtime capacity exhausted (");
}

export function describeRuntimeCapacity(options: {
  readonly readModel: VaultReadModel;
  readonly maxConcurrentRuntimeInstances?: number;
  readonly activeSessionsReader?: ActiveSessionsReader;
}): RuntimeCapacitySnapshot {
  const maxConcurrentRuntimeInstances = options.maxConcurrentRuntimeInstances ?? readConfiguredMaxConcurrentRuntimeInstances();
  const liveSessions = getLiveRuntimeSessions(options.activeSessionsReader);
  const activeRuntimeInstances = liveSessions.length;

  return {
    maxConcurrentRuntimeInstances,
    activeRuntimeInstances,
    availableRuntimeSlots: Math.max(0, maxConcurrentRuntimeInstances - activeRuntimeInstances),
    capacityBlockedTaskCount: 0,
  };
}

export function findRuntimeCapacityBlocker(options: {
  readonly readModel: VaultReadModel;
  readonly taskId: string;
  readonly maxConcurrentRuntimeInstances?: number;
  readonly activeSessionsReader?: ActiveSessionsReader;
  readonly allowCurrentTaskSession?: boolean;
}): RuntimeCapacityBlocker | null {
  const liveSessions = getLiveRuntimeSessions(options.activeSessionsReader);
  const activeSession = liveSessions.find((session) => session.taskId === options.taskId) ?? null;
  if (activeSession && options.allowCurrentTaskSession !== true) {
    return {
      reason: createTaskSessionReason(options.taskId, activeSession),
      activeTask: options.readModel.tasks.find((task) => task.id === options.taskId) ?? null,
      activeSession,
    };
  }

  const task = options.readModel.tasks.find((entry) => entry.id === options.taskId) ?? null;
  const assignee = task?.assignee?.trim() ?? "";
  const activeTask = assignee.length > 0
    ? options.readModel.tasks.find((entry) => entry.id !== options.taskId && entry.assignee === assignee && entry.status === "in-progress") ?? null
    : null;
  if (activeTask !== null) {
    return {
      reason: createCapacityReason(1, 1),
      activeTask,
      activeSession: null,
    };
  }

  return null;
}

export function createRuntimeCapacityError(options: {
  readonly taskId: string;
  readonly blocker: RuntimeCapacityBlocker;
}) {
  return createError({
    statusCode: 409,
    statusMessage: options.blocker.reason,
    data: {
      code: "RUNTIME_CAPACITY_BLOCKED",
      taskId: options.taskId,
      conflictingTaskId: options.blocker.activeTask?.id ?? null,
      conflictingSessionId: options.blocker.activeSession?.sessionId ?? null,
    },
  });
}

export function isRuntimeCapacityError(error: unknown): error is Error & {
  readonly statusCode: number;
  readonly statusMessage: string;
  readonly data?: { readonly code?: string };
} {
  if (typeof error !== "object" || error === null) return false;
  const data = "data" in error ? (error as { readonly data?: { readonly code?: string } }).data : undefined;
  return (
    "statusCode" in error
    && (error as { readonly statusCode?: number }).statusCode === 409
    && data?.code === "RUNTIME_CAPACITY_BLOCKED"
  );
}

export async function runWithRuntimeCapacityGuard<T>(work: () => Promise<T>): Promise<T> {
  const previous = guardedRuntimeCapacityClaims.current ?? Promise.resolve(undefined);
  let releaseCurrent: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const current = previous.catch(() => undefined).then(() => gate);

  guardedRuntimeCapacityClaims.current = current;
  await previous.catch(() => undefined);

  try {
    return await work();
  } finally {
    releaseCurrent?.();
    if (guardedRuntimeCapacityClaims.current === current) {
      guardedRuntimeCapacityClaims.current = null;
    }
  }
}
