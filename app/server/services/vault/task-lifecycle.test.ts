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
  requestTaskApprovalLifecycle,
} from "./task-lifecycle";

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

async function readApprovalDocuments(root: string): Promise<ReadonlyArray<string>> {
  const approvalsDir = join(root, "vault", "shared", "approvals");
  const files = await readdir(approvalsDir);
  return await Promise.all(files.map((file) => readFile(join(approvalsDir, file), "utf8")));
}

describe("task lifecycle service", () => {
  test("patches task status, column, and progress", async () => {
    const vaultRoot = await createVaultRoot(createTask());
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await patchTaskLifecycle({
      taskId: "task-001",
      actorId: "agent-backend-dev",
      vaultRoot,
      now,
      patch: { status: "done", column: "done", progress: 100, result: "Shipped" },
    });

    expect(result.frontmatter.status).toBe("done");
    expect(result.frontmatter.column).toBe("done");
    expect(result.frontmatter.progress).toBe(100);
    expect(result.frontmatter.completed_at).toBe(now.toISOString());
  });

  test("claims a task into in-progress state", async () => {
    const vaultRoot = await createVaultRoot(createTask());
    const now = new Date("2026-04-15T10:00:00Z");

    const result = await claimTaskLifecycle({ taskId: "task-001", actorId: "agent-backend-dev", vaultRoot, now });

    expect(result.frontmatter.status).toBe("in-progress");
    expect(result.frontmatter.column).toBe("in-progress");
    expect(result.frontmatter.execution_started_at).toBe(now.toISOString());
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
