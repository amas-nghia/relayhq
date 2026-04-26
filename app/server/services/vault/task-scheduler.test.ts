import { mkdtemp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { VAULT_SCHEMA_VERSION, type TaskFrontmatter } from "../../../shared/vault/schema";
import { readTaskDocument, serializeTaskDocument } from "./write";
import { releaseDueScheduledTasks } from "./task-scheduler";

function createTask(overrides: Partial<TaskFrontmatter> = {}): TaskFrontmatter {
  return {
    id: "task-001",
    type: "task",
    version: VAULT_SCHEMA_VERSION,
    workspace_id: "ws-demo",
    project_id: "project-demo",
    board_id: "board-demo",
    column: "todo",
    status: "scheduled",
    priority: "high",
    title: "Retry later",
    assignee: "agent-backend-dev",
    created_by: "@alice",
    created_at: "2026-04-15T09:00:00Z",
    updated_at: "2026-04-15T09:00:00Z",
    heartbeat_at: null,
    execution_started_at: null,
    execution_notes: null,
    progress: 0,
    next_run_at: "2026-04-15T09:30:00Z",
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

async function createVaultRoot(task: TaskFrontmatter): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relayhq-scheduler-"));
  await mkdir(join(root, "vault", "shared", "tasks"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "audit"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "tasks", `${task.id}.md`), serializeTaskDocument(task, "# Task\n"), "utf8");
  return root;
}

describe("scheduled task sweep", () => {
  test("re-queues due scheduled tasks and writes an audit note", async () => {
    const root = await createVaultRoot(createTask());

    const result = await releaseDueScheduledTasks({
      vaultRoot: root,
      now: new Date("2026-04-15T10:00:00Z"),
    });

    expect(result.released).toEqual([{ taskId: "task-001", previousNextRunAt: "2026-04-15T09:30:00Z" }]);

    const task = await readTaskDocument(join(root, "vault", "shared", "tasks", "task-001.md"));
    expect(task.frontmatter.status).toBe("todo");
    expect(task.frontmatter.next_run_at).toBeNull();
    expect(task.frontmatter.locked_by).toBeNull();

    const auditFiles = await readdir(join(root, "vault", "shared", "audit"));
    expect(auditFiles).toHaveLength(1);
    const audit = await readFile(join(root, "vault", "shared", "audit", auditFiles[0]!), "utf8");
    expect(audit).toContain("scheduled task re-queued after 2026-04-15T09:30:00Z");
  });

  test("leaves future scheduled tasks untouched", async () => {
    const root = await createVaultRoot(createTask({ next_run_at: "2026-04-15T11:30:00Z" }));

    const result = await releaseDueScheduledTasks({
      vaultRoot: root,
      now: new Date("2026-04-15T10:00:00Z"),
    });

    expect(result.released).toEqual([]);

    const task = await readTaskDocument(join(root, "vault", "shared", "tasks", "task-001.md"));
    expect(task.frontmatter.status).toBe("scheduled");
    expect(task.frontmatter.next_run_at).toBe("2026-04-15T11:30:00Z");
  });
});
