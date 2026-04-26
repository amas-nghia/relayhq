import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { VAULT_SCHEMA_VERSION, type TaskFrontmatter } from "../../../shared/vault/schema";
import { VaultLockError, VaultStaleWriteError } from "./lock";
import {
  VaultSchemaError,
  readTaskDocument,
  serializeTaskDocument,
  syncTaskDocument,
} from "./write";

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
    next_run_at: null,
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
    tags: ["auth", "backend"],
    links: [{ project: "project-auth", thread: "thread-001" }],
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  };
}

async function createVaultFile(task: TaskFrontmatter, body = "") {
  const directory = await mkdtemp(join(tmpdir(), "relayhq-vault-write-"));
  const filePath = join(directory, "task-001.md");

  await writeFile(filePath, serializeTaskDocument(task, body), "utf8");

  return { directory, filePath };
}

describe("vault write flow", () => {
  test("writes task updates atomically and refreshes the lock", async () => {
    const now = new Date("2026-04-14T12:00:00Z");
    const { filePath } = await createVaultFile(createTask(), "## Notes\n");

    const result = await syncTaskDocument({
      filePath,
      actorId: "agent-backend-dev",
      now,
      mutate: () => ({
        title: "Implement password reset and recovery API",
        progress: 40,
        execution_notes: "synced by write protocol",
      }),
    });

    expect(result.previous.title).toBe("Implement password reset API");
    expect(result.frontmatter.title).toBe("Implement password reset and recovery API");
    expect(result.frontmatter.progress).toBe(40);
    expect(result.frontmatter.locked_by).toBe("agent-backend-dev");
    expect(result.frontmatter.locked_at).toBe(now.toISOString());
    expect(result.frontmatter.heartbeat_at).toBe(now.toISOString());
    expect(result.frontmatter.lock_expires_at).toBe(new Date(now.getTime() + 5 * 60 * 1000).toISOString());
    expect(result.body).toBe("## Notes\n");

    const diskState = await readTaskDocument(filePath);
    expect(diskState.frontmatter.title).toBe("Implement password reset and recovery API");
    expect(diskState.frontmatter.progress).toBe(40);
    expect(diskState.frontmatter.locked_by).toBe("agent-backend-dev");
    expect(diskState.frontmatter.locked_at).toBe(now.toISOString());
    expect(diskState.frontmatter.lock_expires_at).toBe(new Date(now.getTime() + 5 * 60 * 1000).toISOString());

    const siblingFiles = await readdir(dirname(filePath));
    const tempFiles = siblingFiles.filter((entry) => entry.startsWith(`.${basename(filePath)}.`) && entry.endsWith(".tmp"));
    expect(tempFiles).toEqual([]);
  });

  test("preserves an owned lock timestamp while refreshing the lease on write", async () => {
    const now = new Date("2026-04-14T12:00:00Z");
    const lockAt = "2026-04-14T11:58:00Z";
    const { filePath } = await createVaultFile(
      createTask({
        locked_by: "agent-backend-dev",
        locked_at: lockAt,
        heartbeat_at: lockAt,
        lock_expires_at: "2026-04-14T12:08:00Z",
      }),
      "## Notes\nexisting lease",
    );

    const result = await syncTaskDocument({
      filePath,
      actorId: "agent-backend-dev",
      now,
      mutate: () => ({
        title: "Implement password reset and recovery API",
        progress: 40,
      }),
    });

    expect(result.frontmatter.locked_by).toBe("agent-backend-dev");
    expect(result.frontmatter.locked_at).toBe(lockAt);
    expect(result.frontmatter.heartbeat_at).toBe(now.toISOString());
    expect(result.frontmatter.lock_expires_at).toBe(new Date(now.getTime() + 5 * 60 * 1000).toISOString());

    const diskState = await readTaskDocument(filePath);
    expect(diskState.frontmatter.locked_at).toBe(lockAt);
    expect(diskState.frontmatter.heartbeat_at).toBe(now.toISOString());
    expect(diskState.frontmatter.lock_expires_at).toBe(new Date(now.getTime() + 5 * 60 * 1000).toISOString());
  });

  test("rejects stale writes when the lock lease is expired", async () => {
    const now = new Date("2026-04-14T12:00:00Z");
    const stale = new Date("2026-04-14T10:00:00Z").toISOString();
    const { filePath } = await createVaultFile(
      createTask({
        locked_by: "agent-other",
        locked_at: stale,
        heartbeat_at: stale,
        lock_expires_at: stale,
      }),
    );
    const before = await readFile(filePath, "utf8");

    await expect(
      syncTaskDocument({
        filePath,
        actorId: "agent-backend-dev",
        now,
        staleAfterMs: 5 * 60 * 1000,
        mutate: () => ({ progress: 80 }),
      }),
    ).rejects.toBeInstanceOf(VaultStaleWriteError);

    const after = await readFile(filePath, "utf8");
    expect(after).toBe(before);
  });

  test("rejects contended writes before the document can be overwritten", async () => {
    const now = new Date("2026-04-14T12:00:00Z");
    const freshLease = new Date("2026-04-14T12:10:00Z").toISOString();
    const { filePath } = await createVaultFile(
      createTask({
        locked_by: "agent-other",
        locked_at: now.toISOString(),
        heartbeat_at: now.toISOString(),
        lock_expires_at: freshLease,
      }),
      "## Notes\nkeep me",
    );
    const before = await readFile(filePath, "utf8");

    await expect(
      syncTaskDocument({
        filePath,
        actorId: "agent-backend-dev",
        now,
        mutate: () => ({ progress: 80 }),
      }),
    ).rejects.toBeInstanceOf(VaultLockError);

    const after = await readFile(filePath, "utf8");
    expect(after).toBe(before);
  });

  test("validates the rewritten task before writeback", async () => {
    const now = new Date("2026-04-14T12:00:00Z");
    const { filePath } = await createVaultFile(createTask());

    await expect(
      syncTaskDocument({
        filePath,
        actorId: "agent-backend-dev",
        now,
        mutate: () => ({ progress: 101 }),
      }),
    ).rejects.toBeInstanceOf(VaultSchemaError);

    const content = await readFile(filePath, "utf8");
    expect(content).toContain("progress: 0");

    const siblingFiles = await readdir(dirname(filePath));
    const tempFiles = siblingFiles.filter((entry) => entry.startsWith(`.${basename(filePath)}.`) && entry.endsWith(".tmp"));
    expect(tempFiles).toEqual([]);
  });

  test("can release a task lock as part of a write", async () => {
    const now = new Date("2026-04-14T12:00:00Z");
    const { filePath } = await createVaultFile(createTask({
      locked_by: "agent-backend-dev",
      locked_at: "2026-04-14T11:55:00Z",
      heartbeat_at: "2026-04-14T11:55:00Z",
      lock_expires_at: "2026-04-14T12:00:00Z",
    }));

    const result = await syncTaskDocument({
      filePath,
      actorId: "agent-backend-dev",
      now,
      releaseLock: true,
      mutate: () => ({ status: "scheduled", next_run_at: "2026-04-14T13:00:00Z" }),
    });

    expect(result.frontmatter.locked_by).toBeNull();
    expect(result.frontmatter.locked_at).toBeNull();
    expect(result.frontmatter.lock_expires_at).toBeNull();
    expect(result.frontmatter.status).toBe("scheduled");
    expect(result.frontmatter.next_run_at).toBe("2026-04-14T13:00:00Z");
  });
});
