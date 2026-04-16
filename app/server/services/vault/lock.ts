import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { TaskFrontmatter } from "../../../shared/vault/schema";

export const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_STALE_AFTER_MS = 2 * DEFAULT_LOCK_TTL_MS;
export const DEFAULT_TASK_HEARTBEAT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type TaskLockMode = "unlocked" | "owned" | "contended" | "stale";

export interface TaskLockState {
  readonly mode: TaskLockMode;
  readonly owner: string | null;
  readonly stale: boolean;
  readonly staleReason: string | null;
  readonly heartbeatAt: string | null;
  readonly lockExpiresAt: string | null;
}

export interface TaskLeaseOptions {
  readonly actorId: string;
  readonly now: Date;
  readonly lockTtlMs: number;
}

export interface TaskFileLockOptions extends TaskLeaseOptions {
  readonly staleAfterMs: number;
}

export interface TaskFileLock {
  readonly lockPath: string;
  release(): Promise<void>;
}

export type VaultFileLock = TaskFileLock;

interface TaskFileLockRecord {
  readonly actor_id: string;
  readonly heartbeat_at: string;
  readonly lock_expires_at: string;
}

export class VaultLockError extends Error {
  public readonly actorId: string;
  public readonly owner: string | null;
  public readonly code: "locked" | "stale";

  constructor(message: string, options: { readonly actorId: string; readonly owner: string | null; readonly code: "locked" | "stale" }) {
    super(message);
    this.name = "VaultLockError";
    this.actorId = options.actorId;
    this.owner = options.owner;
    this.code = options.code;
  }
}

export class VaultStaleWriteError extends VaultLockError {
  constructor(actorId: string, owner: string | null) {
    super("Task lock is stale and must be recovered before writing.", { actorId, owner, code: "stale" });
    this.name = "VaultStaleWriteError";
  }
}

function toIso(date: Date): string {
  return date.toISOString();
}

function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

function parseTimestamp(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function lockFilePath(filePath: string): string {
  return `${filePath}.lock`;
}

function parseLockRecord(content: string): TaskFileLockRecord {
  const parsed = JSON.parse(content) as Partial<TaskFileLockRecord>;

  if (typeof parsed.actor_id !== "string" || typeof parsed.heartbeat_at !== "string" || typeof parsed.lock_expires_at !== "string") {
    throw new Error("Invalid task lock record.");
  }

  return parsed as TaskFileLockRecord;
}

function getLockRecordState(record: TaskFileLockRecord, now: Date, staleAfterMs: number): TaskLockState {
  const heartbeatAt = parseTimestamp(record.heartbeat_at);
  const lockExpiresAt = parseTimestamp(record.lock_expires_at);
  const staleByHeartbeat = heartbeatAt !== null && now.getTime() - heartbeatAt > staleAfterMs;
  const staleByExpiry = lockExpiresAt !== null && now.getTime() > lockExpiresAt;
  const stale = staleByHeartbeat || staleByExpiry;

  return {
    mode: stale ? "stale" : "contended",
    owner: record.actor_id,
    stale,
    staleReason: staleByHeartbeat ? "heartbeat" : staleByExpiry ? "lock-expired" : null,
    heartbeatAt: record.heartbeat_at,
    lockExpiresAt: record.lock_expires_at,
  };
}

export function getTaskLockState(task: Pick<TaskFrontmatter, "heartbeat_at" | "lock_expires_at" | "locked_by">, now: Date, staleAfterMs: number = DEFAULT_STALE_AFTER_MS): TaskLockState {
  const heartbeatAt = parseTimestamp(task.heartbeat_at);
  const lockExpiresAt = parseTimestamp(task.lock_expires_at);
  const owner = task.locked_by;
  const staleByHeartbeat = owner !== null && heartbeatAt !== null && now.getTime() - heartbeatAt > staleAfterMs;
  const staleByExpiry = owner !== null && lockExpiresAt !== null && now.getTime() > lockExpiresAt;
  const stale = staleByHeartbeat || staleByExpiry;
  const staleReason = staleByHeartbeat ? "heartbeat" : staleByExpiry ? "lock-expired" : null;

  if (owner === null) {
    return {
      mode: "unlocked",
      owner,
      stale: false,
      staleReason: null,
      heartbeatAt: task.heartbeat_at,
      lockExpiresAt: task.lock_expires_at,
    };
  }

  if (stale) {
    return {
      mode: "stale",
      owner,
      stale: true,
      staleReason,
      heartbeatAt: task.heartbeat_at,
      lockExpiresAt: task.lock_expires_at,
    };
  }

  return {
    mode: "owned",
    owner,
    stale: false,
    staleReason: null,
    heartbeatAt: task.heartbeat_at,
    lockExpiresAt: task.lock_expires_at,
  };
}

export function isTaskHeartbeatStale(
  task: Pick<TaskFrontmatter, "heartbeat_at" | "status">,
  now: Date,
  staleAfterMs: number = DEFAULT_TASK_HEARTBEAT_STALE_AFTER_MS,
): boolean {
  if (task.status === "done" || task.status === "cancelled") {
    return false;
  }

  const heartbeatAt = parseTimestamp(task.heartbeat_at);
  if (heartbeatAt === null) {
    return false;
  }

  return now.getTime() - heartbeatAt > staleAfterMs;
}

export function assertTaskWriteable(task: Pick<TaskFrontmatter, "heartbeat_at" | "lock_expires_at" | "locked_by">, actorId: string, now: Date, staleAfterMs: number = DEFAULT_STALE_AFTER_MS): TaskLockState {
  const lockState = getTaskLockState(task, now, staleAfterMs);

  if (lockState.mode === "stale") {
    throw new VaultStaleWriteError(actorId, lockState.owner);
  }

  if (lockState.owner !== null && lockState.owner !== actorId) {
    throw new VaultLockError("Task is locked by another actor.", {
      actorId,
      owner: lockState.owner,
      code: "locked",
    });
  }

  return lockState;
}

export function claimTaskLock(task: TaskFrontmatter, options: TaskLeaseOptions): TaskFrontmatter {
  const nowIso = toIso(options.now);
  const currentOwner = task.locked_by;

  return {
    ...task,
    locked_by: options.actorId,
    locked_at: currentOwner === options.actorId && task.locked_at !== null ? task.locked_at : nowIso,
    lock_expires_at: toIso(addMilliseconds(options.now, options.lockTtlMs)),
    heartbeat_at: nowIso,
  };
}

export function refreshTaskHeartbeat(task: TaskFrontmatter, options: TaskLeaseOptions): TaskFrontmatter {
  if (task.locked_by !== options.actorId) {
    throw new VaultLockError("Only the lock owner can refresh the heartbeat.", {
      actorId: options.actorId,
      owner: task.locked_by,
      code: "locked",
    });
  }

  return claimTaskLock(task, options);
}

export async function acquireTaskFileLock(filePath: string, options: TaskFileLockOptions): Promise<TaskFileLock> {
  const lockPath = lockFilePath(filePath);
  const record = {
    actor_id: options.actorId,
    heartbeat_at: toIso(options.now),
    lock_expires_at: toIso(addMilliseconds(options.now, options.lockTtlMs)),
  } satisfies TaskFileLockRecord;

  await mkdir(dirname(lockPath), { recursive: true });

  for (;;) {
    try {
      await writeFile(lockPath, JSON.stringify(record), { flag: "wx" });
      break;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? (error as { readonly code?: string }).code : undefined;

      if (code !== "EEXIST") {
        throw error;
      }

      const current = parseLockRecord(await readFile(lockPath, "utf8"));
      const state = getLockRecordState(current, options.now, options.staleAfterMs);

      if (state.mode === "stale") {
        throw new VaultStaleWriteError(options.actorId, state.owner);
      }

      throw new VaultLockError("Task is locked by another actor.", {
        actorId: options.actorId,
        owner: state.owner,
        code: "locked",
      });
    }
  }

  return {
    lockPath,
    async release() {
      await unlink(lockPath).catch(() => undefined);
    },
  };
}

export async function acquireVaultFileLock(filePath: string, options: TaskFileLockOptions): Promise<VaultFileLock> {
  return acquireTaskFileLock(filePath, options);
}
