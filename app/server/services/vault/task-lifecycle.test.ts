import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { VAULT_SCHEMA_VERSION, type TaskFrontmatter } from "../../../shared/vault/schema";
import { readTaskDocument, serializeTaskDocument, VaultSchemaError } from "./write";
import {
  approveTaskLifecycle,
  claimTaskLifecycle,
  heartbeatTaskLifecycle,
  patchTaskLifecycle,
  rejectTaskLifecycle,
  scheduleTaskLifecycle,
  requestTaskApprovalLifecycle,
} from "./task-lifecycle";
import { subscribeRealtimeUpdates, type RealtimeUpdate } from "../realtime/bus";
import { readWebhookSettings } from "../settings/webhooks";

function createTask(overrides: Partial<TaskFrontmatter> = {}): TaskFrontmatter {
  return {
    id: "task-001",
    type: "task",
    version: VAULT_SCHEMA_VERSION,
    workspace_id: "ws-demo",
    project_id: "project-demo",
    board_id: "board-demo",
    column: "todo",
    status: "todo",
    priority: "high",
    title: "Ship task lifecycle APIs",
    assignee: "agent-backend-dev",
    created_by: "@alice",
    created_at: "2026-04-15T09:00:00Z",
    updated_at: "2026-04-15T09:00:00Z",
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
    tags: ["phase-1"],
    links: [{ project: "project-demo", thread: "thread-phase-1" }],
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  };
}

async function createVaultRoot(task: TaskFrontmatter): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relayhq-task-api-"));
  const tasksDir = join(root, "vault", "shared", "tasks");
  await mkdir(join(root, "vault", "shared", "approvals"), { recursive: true });
  await mkdir(tasksDir, { recursive: true });
  await writeFile(join(tasksDir, `${task.id}.md`), serializeTaskDocument(task, "# Task\n"), "utf8");
  return root;
}

async function writeWebhookSettingsFile(root: string, event: string): Promise<void> {
  await mkdir(join(root, "vault", "shared", "settings"), { recursive: true });
  await writeFile(
    join(root, "vault", "shared", "settings", "webhooks.json"),
    JSON.stringify({
      webhooks: [{ id: "webhook-1", url: "https://93.184.216.34/hook", events: [event] }],
      deliveries: [],
    }, null, 2),
    "utf8",
  );
}

async function waitForWebhookDelivery(root: string): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const loaded = await readWebhookSettings(root);
    if (loaded.deliveries.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for webhook delivery.");
}

async function readApprovalDocuments(root: string): Promise<ReadonlyArray<string>> {
  const approvalsDir = join(root, "vault", "shared", "approvals");
  const files = await readdir(approvalsDir);
  return await Promise.all(files.map((file) => readFile(join(approvalsDir, file), "utf8")));
}

describe("task lifecycle service", () => {
  test("patches task status, column, and progress", async () => {
    const vaultRoot = await createVaultRoot(createTask({ locked_by: "agent-backend-dev", locked_at: "2026-04-15T09:58:00Z", lock_expires_at: "2026-04-15T10:03:00Z" }));
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await patchTaskLifecycle({
      taskId: "task-001",
      actorId: "agent-backend-dev",
      vaultRoot,
      now,
      patch: { status: "review", column: "review", progress: 100, result: "Shipped" },
    });

    expect(result.frontmatter.status).toBe("review");
    expect(result.frontmatter.column).toBe("review");
    expect(result.frontmatter.progress).toBe(100);
    expect(result.frontmatter.completed_at).toBe(now.toISOString());
    expect(result.frontmatter.locked_by).toBeNull();
    expect(result.frontmatter.history?.[0]).toMatchObject({
      actor: "agent-backend-dev",
      action: "moved-to-review",
      to_status: "review",
    });
  });

  test("recovers stale locks when moving a task to review", async () => {
    const vaultRoot = await createVaultRoot(createTask({
      locked_by: "agent-backend-dev",
      locked_at: "2026-04-15T09:40:00Z",
      lock_expires_at: "2026-04-15T09:45:00Z",
    }));
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await patchTaskLifecycle({
      taskId: "task-001",
      actorId: "human-user",
      vaultRoot,
      now,
      patch: { status: "review", column: "review", progress: 100, result: "Ready for handoff" },
    });

    expect(result.frontmatter.status).toBe("review");
    expect(result.frontmatter.locked_by).toBeNull();
    expect(result.frontmatter.locked_at).toBeNull();
    expect(result.frontmatter.lock_expires_at).toBeNull();
  });

  test("recovers stale locks when a human reopens a review task to todo", async () => {
    const vaultRoot = await createVaultRoot(createTask({
      status: "review",
      column: "review",
      locked_by: "agent-backend-dev",
      locked_at: "2026-04-15T09:40:00Z",
      lock_expires_at: "2026-04-15T09:45:00Z",
    }));
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await patchTaskLifecycle({
      taskId: "task-001",
      actorId: "human-user",
      vaultRoot,
      now,
      recoverStaleLock: true,
      patch: { status: "todo", column: "todo" },
    });

    expect(result.frontmatter.status).toBe("todo");
    expect(result.frontmatter.locked_by).toBeNull();
    expect(result.frontmatter.locked_at).toBeNull();
    expect(result.frontmatter.lock_expires_at).toBeNull();
  });

  test("releases the lock for assignment-only human patches when requested", async () => {
    const vaultRoot = await createVaultRoot(createTask({ assignee: null }));
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await patchTaskLifecycle({
      taskId: "task-001",
      actorId: "human-user",
      vaultRoot,
      now,
      releaseLock: true,
      patch: { assignee: "agent-backend-dev" },
    });

    expect(result.frontmatter.assignee).toBe("agent-backend-dev");
    expect(result.frontmatter.locked_by).toBeNull();
    expect(result.frontmatter.locked_at).toBeNull();
    expect(result.frontmatter.lock_expires_at).toBeNull();
  });

  test("clears completed_at when moving a task to blocked", async () => {
    const vaultRoot = await createVaultRoot(createTask({ status: "done", column: "done", completed_at: "2026-04-15T09:30:00Z" }));
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await patchTaskLifecycle({
      taskId: "task-001",
      actorId: "agent-backend-dev",
      vaultRoot,
      now,
      patch: { status: "blocked", column: "review", blocked_reason: "Waiting on dependency" },
    });

    expect(result.frontmatter.status).toBe("blocked");
    expect(result.frontmatter.completed_at).toBeNull();
    expect(result.frontmatter.blocked_since).toBe(now.toISOString());
  });

  test("claims a task into in-progress state", async () => {
    const vaultRoot = await createVaultRoot(createTask());
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await claimTaskLifecycle({ taskId: "task-001", actorId: "agent-backend-dev", vaultRoot, now });

    expect(result.frontmatter.status).toBe("in-progress");
    expect(result.frontmatter.column).toBe("in-progress");
    expect(result.frontmatter.execution_started_at).toBe(now.toISOString());
    expect(result.frontmatter.history?.[0]).toMatchObject({
      actor: "agent-backend-dev",
      action: "claimed",
      to_status: "in-progress",
    });
  });

  test("publishes realtime updates when the task lifecycle changes", async () => {
    const vaultRoot = await createVaultRoot(createTask());
    const now = new Date("2026-04-15T10:00:00Z");
    const updates: RealtimeUpdate[] = [];
    const unsubscribe = subscribeRealtimeUpdates((update) => {
      updates.push(update);
    });

    try {
      await claimTaskLifecycle({ taskId: "task-001", actorId: "agent-backend-dev", vaultRoot, now });

      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        kind: "vault.changed",
        reason: "task.claimed",
        taskId: "task-001",
        source: "agent-backend-dev",
      });
    } finally {
      unsubscribe();
    }
  });

  test("publishes realtime updates for scheduled tasks", async () => {
    const vaultRoot = await createVaultRoot(createTask({ status: "in-progress", column: "in-progress" }));
    const now = new Date("2026-04-15T10:00:00Z");
    const updates: RealtimeUpdate[] = [];
    const unsubscribe = subscribeRealtimeUpdates((update) => {
      updates.push(update);
    });

    try {
      await scheduleTaskLifecycle({
        taskId: "task-001",
        actorId: "agent-backend-dev",
        vaultRoot,
        now,
        nextRunAt: "2026-04-15T11:00:00Z",
      });

      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        kind: "vault.changed",
        reason: "task.scheduled",
        taskId: "task-001",
        source: "agent-backend-dev",
      });
    } finally {
      unsubscribe();
    }
  });

  test("emits a task.scheduled webhook for subscribed integrations", async () => {
    const vaultRoot = await createVaultRoot(createTask({ status: "in-progress", column: "in-progress" }));
    await writeWebhookSettingsFile(vaultRoot, "task.scheduled");
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async (_url: string, init?: RequestInit) => {
      fetchCalls += 1;
      expect(init?.headers).toMatchObject({
        "x-relayhq-event": "task.scheduled",
      });
      return new Response(null, { status: 200 });
    };

    try {
      const now = new Date("2026-04-15T10:00:00Z");
      await scheduleTaskLifecycle({
        taskId: "task-001",
        actorId: "agent-backend-dev",
        vaultRoot,
        now,
        nextRunAt: "2026-04-15T11:00:00Z",
      });

      await waitForWebhookDelivery(vaultRoot);

      expect(fetchCalls).toBe(1);
      const loaded = await readWebhookSettings(vaultRoot);
      expect(loaded.deliveries[0]?.event).toBe("task.scheduled");
      expect(loaded.deliveries[0]?.status).toBe("success");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("publishes realtime updates for heartbeats", async () => {
    const vaultRoot = await createVaultRoot(createTask({ status: "in-progress", column: "in-progress" }));
    const now = new Date("2026-04-15T10:00:00Z");
    const updates: RealtimeUpdate[] = [];
    const unsubscribe = subscribeRealtimeUpdates((update) => {
      updates.push(update);
    });

    try {
      await heartbeatTaskLifecycle({ taskId: "task-001", actorId: "agent-backend-dev", vaultRoot, now });

      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        kind: "vault.changed",
        reason: "task.updated",
        taskId: "task-001",
        source: "agent-backend-dev",
      });
    } finally {
      unsubscribe();
    }
  });

  test("emits a task.updated webhook when heartbeat changes", async () => {
    const vaultRoot = await createVaultRoot(createTask({ status: "in-progress", column: "in-progress" }));
    await writeWebhookSettingsFile(vaultRoot, "task.updated");
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async (_url: string, init?: RequestInit) => {
      fetchCalls += 1;
      expect(init?.headers).toMatchObject({
        "x-relayhq-event": "task.updated",
      });
      return new Response(null, { status: 200 });
    };

    try {
      const now = new Date("2026-04-15T10:00:00Z");
      await heartbeatTaskLifecycle({ taskId: "task-001", actorId: "agent-backend-dev", vaultRoot, now });

      await waitForWebhookDelivery(vaultRoot);

      expect(fetchCalls).toBe(1);
      const loaded = await readWebhookSettings(vaultRoot);
      expect(loaded.deliveries[0]?.event).toBe("task.updated");
      expect(loaded.deliveries[0]?.status).toBe("success");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("reclaims a stale task lock during claim", async () => {
    const staleAt = "2026-04-15T08:00:00Z";
    const vaultRoot = await createVaultRoot(createTask({
      locked_by: "agent-other",
      locked_at: staleAt,
      heartbeat_at: staleAt,
      lock_expires_at: staleAt,
    }));
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await claimTaskLifecycle({ taskId: "task-001", actorId: "agent-backend-dev", vaultRoot, now });

    expect(result.frontmatter.status).toBe("in-progress");
    expect(result.frontmatter.locked_by).toBe("agent-backend-dev");
    expect(result.frontmatter.locked_at).toBe(now.toISOString());
    expect(result.frontmatter.lock_expires_at).toBe(new Date(now.getTime() + 5 * 60 * 1000).toISOString());
  });

  test("refreshes task heartbeat without mutating business state", async () => {
    const lockAt = "2026-04-15T09:58:00Z";
    const vaultRoot = await createVaultRoot(
      createTask({
        status: "in-progress",
        column: "in-progress",
        locked_by: "agent-backend-dev",
        locked_at: lockAt,
        heartbeat_at: lockAt,
        lock_expires_at: "2026-04-15T10:03:00Z",
      }),
    );
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await heartbeatTaskLifecycle({ taskId: "task-001", actorId: "agent-backend-dev", vaultRoot, now });

    expect(result.frontmatter.status).toBe("in-progress");
    expect(result.frontmatter.heartbeat_at).toBe(now.toISOString());
    expect(result.frontmatter.locked_at).toBe(lockAt);
  });

  test("requests approval through the lifecycle service", async () => {
    const vaultRoot = await createVaultRoot(createTask({ status: "in-progress", column: "in-progress" }));
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await requestTaskApprovalLifecycle({
      taskId: "task-001",
      actorId: "agent-backend-dev",
      reason: "Need human sign-off",
      vaultRoot,
      now,
    });

    expect(result.frontmatter.status).toBe("waiting-approval");
    expect(result.frontmatter.column).toBe("review");
    expect(result.frontmatter.approval_needed).toBe(true);
    expect(result.frontmatter.approval_reason).toBe("Need human sign-off");
    expect(result.frontmatter.approval_outcome).toBe("pending");

    const approvals = await readApprovalDocuments(vaultRoot);
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toContain('status: "requested"');
    expect(approvals[0]).toContain('outcome: "pending"');
  });

  test("schedules a task and releases its lock", async () => {
    const vaultRoot = await createVaultRoot(createTask({
      status: "in-progress",
      column: "in-progress",
      locked_by: "agent-backend-dev",
      locked_at: "2026-04-15T09:55:00Z",
      lock_expires_at: "2026-04-15T10:05:00Z",
    }));
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await scheduleTaskLifecycle({
      taskId: "task-001",
      actorId: "agent-backend-dev",
      vaultRoot,
      now,
      nextRunAt: "2026-04-15T11:00:00Z",
    });

    expect(result.frontmatter.status).toBe("scheduled");
    expect(result.frontmatter.column).toBe("todo");
    expect(result.frontmatter.next_run_at).toBe("2026-04-15T11:00:00Z");
    expect(result.frontmatter.locked_by).toBeNull();
    expect(result.frontmatter.locked_at).toBeNull();
    expect(result.frontmatter.lock_expires_at).toBeNull();
  });

  test("spawns the next recurring instance when a cron task completes", async () => {
    const vaultRoot = await createVaultRoot(createTask({
      status: "scheduled",
      column: "todo",
      next_run_at: "2026-04-15T09:30:00Z",
      cron_schedule: "30 9 * * 1-5",
    }));
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await patchTaskLifecycle({
      taskId: "task-001",
      actorId: "agent-backend-dev",
      vaultRoot,
      now,
      patch: { status: "done", column: "done", progress: 100, result: "Completed" },
    });

    expect(result.frontmatter.status).toBe("done");

    const taskFiles = await readdir(join(vaultRoot, "vault", "shared", "tasks"));
    expect(taskFiles.length).toBe(2);
    const spawnedFile = taskFiles.find((file) => file !== "task-001.md");
    expect(spawnedFile).toBeDefined();

    const spawned = await readTaskDocument(join(vaultRoot, "vault", "shared", "tasks", spawnedFile!));
    expect(spawned.frontmatter.status).toBe("scheduled");
    expect(spawned.frontmatter.parent_task_id).toBe("task-001");
    expect(spawned.frontmatter.cron_schedule).toBe("30 9 * * 1-5");
    expect(spawned.frontmatter.next_run_at).toBe("2026-04-16T09:30:00.000Z");
  });

  test("approves and rejects tasks through the lifecycle service", async () => {
    const pendingTask = createTask({
      status: "waiting-approval",
      column: "review",
      approval_needed: true,
      approval_requested_by: "agent-backend-dev",
      approval_reason: "Need human sign-off",
    });
    const approveRoot = await createVaultRoot(pendingTask);
    const rejectRoot = await createVaultRoot(pendingTask);
    const now = new Date("2026-04-15T10:00:00Z");

    const approved = await approveTaskLifecycle({ taskId: "task-001", actorId: "@alice", vaultRoot: approveRoot, now });
    expect(approved.frontmatter.status).toBe("in-progress");
    expect(approved.frontmatter.column).toBe("in-progress");
    expect(approved.frontmatter.approval_outcome).toBe("approved");
    expect(approved.frontmatter.approved_by).toBe("@alice");
    expect((await readApprovalDocuments(approveRoot))[0]).toContain('outcome: "approved"');

    const rejected = await rejectTaskLifecycle({
      taskId: "task-001",
      actorId: "@alice",
      reason: "Missing release notes",
      vaultRoot: rejectRoot,
      now,
    });
    expect(rejected.frontmatter.status).toBe("blocked");
    expect(rejected.frontmatter.column).toBe("review");
    expect(rejected.frontmatter.approval_outcome).toBe("rejected");
    expect(rejected.frontmatter.blocked_reason).toBe("Missing release notes");
    expect((await readApprovalDocuments(rejectRoot))[0]).toContain('outcome: "rejected"');
  });

  test("keeps validation protection for malformed writes", async () => {
    const vaultRoot = await createVaultRoot(createTask());

    await expect(
      patchTaskLifecycle({
        taskId: "task-001",
        actorId: "agent-backend-dev",
        vaultRoot,
        patch: { title: "Bearer abcdefghijklmnopqrstuvwxyz012345" },
      }),
    ).rejects.toBeInstanceOf(VaultSchemaError);

    const state = await readTaskDocument(join(vaultRoot, "vault", "shared", "tasks", "task-001.md"));
    expect(state.frontmatter.title).toBe("Ship task lifecycle APIs");
  });
});
