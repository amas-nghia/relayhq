import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { VAULT_SCHEMA_VERSION, type TaskFrontmatter } from "../../../shared/vault/schema";
import {
  acquireTaskFileLock,
  assertTaskWriteable,
  isTaskHeartbeatStale,
  getTaskLockState,
  VaultLockError,
  VaultStaleWriteError,
  refreshTaskHeartbeat,
} from "./lock";

function createTask(overrides: Partial<TaskFrontmatter> = {}): TaskFrontmatter {
  return {
    id: "task-001",
    type: "task",
    version: VAULT_SCHEMA_VERSION,
    workspace_id: "ws-acme",
    project_id: "project-auth",
    board_id: "board-auth-main",
    column: "todo",
    status: "todo",
    priority: "high",
    title: "Implement password reset API",
    assignee: "agent-backend-dev",
    created_by: "@alice",
    created_at: "2026-04-14T10:00:00Z",
    updated_at: "2026-04-14T10:00:00Z",
    heartbeat_at: null,
    execution_started_at: null,
    execution_notes: null,
    progress: 0,
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
    parent_task_id: null,
    depends_on: [],
    tags: [],
    links: [],
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  };
}

describe("vault lock state", () => {
  test("reports owned locks as writeable", () => {
    // Arrange
    const now = new Date("2026-04-14T12:00:00Z");
    const task = createTask({
      locked_by: "agent-backend-dev",
      locked_at: now.toISOString(),
      heartbeat_at: now.toISOString(),
      lock_expires_at: new Date("2026-04-14T12:10:00Z").toISOString(),
    });

    // Act
    const state = getTaskLockState(task, now, 5 * 60 * 1000);
    const writeable = assertTaskWriteable(task, "agent-backend-dev", now, 5 * 60 * 1000);

    // Assert
    expect(state.mode).toBe("owned");
    expect(state.owner).toBe("agent-backend-dev");
    expect(state.stale).toBe(false);
    expect(writeable.mode).toBe("owned");
  });

  test("rejects stale and contended locks before writes proceed", () => {
    // Arrange
    const now = new Date("2026-04-14T12:00:00Z");
    const staleTask = createTask({
      locked_by: "agent-other",
      locked_at: "2026-04-14T10:00:00Z",
      heartbeat_at: "2026-04-14T10:00:00Z",
      lock_expires_at: "2026-04-14T10:05:00Z",
    });
    const contendedTask = createTask({
      locked_by: "agent-other",
      locked_at: now.toISOString(),
      heartbeat_at: now.toISOString(),
      lock_expires_at: new Date("2026-04-14T12:10:00Z").toISOString(),
    });

    // Act
    const staleState = getTaskLockState(staleTask, now, 5 * 60 * 1000);
    const contendedState = getTaskLockState(contendedTask, now, 5 * 60 * 1000);

    // Assert
    expect(staleState.mode).toBe("stale");
    expect(contendedState.mode).toBe("owned");
    expect(() => assertTaskWriteable(staleTask, "agent-backend-dev", now, 5 * 60 * 1000)).toThrow(VaultStaleWriteError);
    expect(() => assertTaskWriteable(contendedTask, "agent-backend-dev", now, 5 * 60 * 1000)).toThrow(VaultLockError);
  });

  test("refreshes an owned heartbeat without changing the original lock timestamp", () => {
    // Arrange
    const now = new Date("2026-04-14T12:00:00Z");
    const ownedAt = "2026-04-14T11:30:00Z";
    const task = createTask({
      locked_by: "agent-backend-dev",
      locked_at: ownedAt,
      heartbeat_at: ownedAt,
      lock_expires_at: "2026-04-14T11:35:00Z",
    });

    // Act
    const refreshed = refreshTaskHeartbeat(task, {
      actorId: "agent-backend-dev",
      now,
      lockTtlMs: 5 * 60 * 1000,
    });

    // Assert
    expect(refreshed.locked_by).toBe("agent-backend-dev");
    expect(refreshed.locked_at).toBe(ownedAt);
    expect(refreshed.heartbeat_at).toBe(now.toISOString());
    expect(refreshed.lock_expires_at).toBe(new Date(now.getTime() + 5 * 60 * 1000).toISOString());
  });

  test("rejects heartbeat refresh attempts from non-owners", () => {
    // Arrange
    const now = new Date("2026-04-14T12:00:00Z");
    const task = createTask({
      locked_by: "agent-other",
      locked_at: now.toISOString(),
      heartbeat_at: now.toISOString(),
      lock_expires_at: new Date("2026-04-14T12:10:00Z").toISOString(),
    });

    // Act / Assert
    expect(() =>
      refreshTaskHeartbeat(task, {
        actorId: "agent-backend-dev",
        now,
        lockTtlMs: 5 * 60 * 1000,
      }),
    ).toThrow(VaultLockError);
  });

  test("uses a 24-hour heartbeat window for read-model stale detection", () => {
    // Arrange
    const now = new Date("2026-04-16T09:24:00Z");

    const recentTask = createTask({
      status: "in-progress",
      heartbeat_at: "2026-04-16T00:18:17.806Z",
    });
    const nearlyDayOldTask = createTask({
      id: "task-002",
      status: "in-progress",
      heartbeat_at: "2026-04-15T09:28:00Z",
    });
    const staleWaitingApprovalTask = createTask({
      id: "task-003",
      status: "waiting-approval",
      heartbeat_at: "2026-04-15T09:20:00Z",
      locked_by: null,
      lock_expires_at: null,
    });

    // Act / Assert
    expect(isTaskHeartbeatStale(recentTask, now)).toBe(false);
    expect(isTaskHeartbeatStale(nearlyDayOldTask, now)).toBe(false);
    expect(isTaskHeartbeatStale(staleWaitingApprovalTask, now)).toBe(true);
  });
});

describe("vault file locks", () => {
  test("acquires and releases an exclusive lock file", async () => {
    // Arrange
    const directory = await mkdtemp(join(tmpdir(), "relayhq-lock-"));
    const filePath = join(directory, "task-001.md");
    const lockPath = `${filePath}.lock`;

    try {
      // Act
      const lease = await acquireTaskFileLock(filePath, {
        actorId: "agent-backend-dev",
        now: new Date("2026-04-14T12:00:00Z"),
        lockTtlMs: 5 * 60 * 1000,
        staleAfterMs: 10 * 60 * 1000,
      });

      // Assert
      expect(await readFile(lockPath, "utf8")).toContain("agent-backend-dev");

      await lease.release();

      await expect(readFile(lockPath, "utf8")).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("rejects contended and stale lock files before any write can proceed", async () => {
    // Arrange
    const directory = await mkdtemp(join(tmpdir(), "relayhq-lock-"));
    const contendedFile = join(directory, "contended.md");
    const staleFile = join(directory, "stale.md");
    const contendedLockPath = `${contendedFile}.lock`;
    const staleLockPath = `${staleFile}.lock`;
    const now = new Date("2026-04-14T12:00:00Z");

    await writeFile(
      contendedLockPath,
      JSON.stringify({
        actor_id: "agent-other",
        heartbeat_at: now.toISOString(),
        lock_expires_at: new Date("2026-04-14T12:10:00Z").toISOString(),
      }),
      "utf8",
    );
    await writeFile(
      staleLockPath,
      JSON.stringify({
        actor_id: "agent-other",
        heartbeat_at: "2026-04-14T10:00:00Z",
        lock_expires_at: "2026-04-14T10:05:00Z",
      }),
      "utf8",
    );

    const contendedBefore = await readFile(contendedLockPath, "utf8");
    const staleBefore = await readFile(staleLockPath, "utf8");

    try {
      // Act / Assert
      await expect(
        acquireTaskFileLock(contendedFile, {
          actorId: "agent-backend-dev",
          now,
          lockTtlMs: 5 * 60 * 1000,
          staleAfterMs: 5 * 60 * 1000,
        }),
      ).rejects.toBeInstanceOf(VaultLockError);

      await expect(
        acquireTaskFileLock(staleFile, {
          actorId: "agent-backend-dev",
          now,
          lockTtlMs: 5 * 60 * 1000,
          staleAfterMs: 5 * 60 * 1000,
        }),
      ).rejects.toBeInstanceOf(VaultStaleWriteError);

      expect(await readFile(contendedLockPath, "utf8")).toBe(contendedBefore);
      expect(await readFile(staleLockPath, "utf8")).toBe(staleBefore);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
