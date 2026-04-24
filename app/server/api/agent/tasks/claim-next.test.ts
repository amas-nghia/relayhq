import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { VAULT_SCHEMA_VERSION, type TaskFrontmatter } from "../../../../shared/vault/schema";
import { serializeTaskDocument } from "../../../services/vault/write";
import { claimNextAgentTask } from "./claim-next.post";

async function seedVaultRoot(root: string) {
  await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "projects"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "boards"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "columns"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "tasks"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "approvals"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "workspaces", "ws-demo.md"), `---\nid: "ws-demo"\ntype: "workspace"\nname: "Demo Workspace"\nowner_ids: ["@owner"]\nmember_ids: ["@owner"]\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "projects", "project-demo.md"), `---\nid: "project-demo"\ntype: "project"\nworkspace_id: "ws-demo"\nname: "Demo Project"\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "boards", "board-alpha.md"), `---\nid: "board-alpha"\ntype: "board"\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nname: "Alpha Board"\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "boards", "board-beta.md"), `---\nid: "board-beta"\ntype: "board"\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nname: "Beta Board"\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "columns", "todo-alpha.md"), `---\nid: "todo-alpha"\ntype: "column"\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nboard_id: "board-alpha"\nname: "Todo"\nposition: 0\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "columns", "todo-beta.md"), `---\nid: "todo-beta"\ntype: "column"\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nboard_id: "board-beta"\nname: "Todo"\nposition: 0\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
}

function createTask(taskId: string, overrides: Partial<TaskFrontmatter> = {}): TaskFrontmatter {
  return {
    id: taskId,
    type: "task",
    version: VAULT_SCHEMA_VERSION,
    workspace_id: "ws-demo",
    project_id: "project-demo",
    board_id: "board-alpha",
    column: "todo",
    status: "todo",
    priority: "medium",
    title: `Task ${taskId}`,
    assignee: "agent-claude-code",
    created_by: "@relayhq-web",
    created_at: "2026-04-19T00:00:00Z",
    updated_at: "2026-04-19T00:00:00Z",
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

async function writeTask(root: string, task: TaskFrontmatter, body = "") {
  await writeFile(join(root, "vault", "shared", "tasks", `${task.id}.md`), serializeTaskDocument(task, body), "utf8");
}

describe("POST /api/agent/tasks/claim-next", () => {
  test("claims the highest priority eligible task and returns inline bootstrap", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-claim-next-"));
    try {
      await seedVaultRoot(root);
      await writeTask(root, createTask("task-low", { priority: "low", created_at: "2026-04-19T00:00:00Z" }));
      await writeTask(root, createTask("task-high", { priority: "high", created_at: "2026-04-19T01:00:00Z" }));

      const response = await claimNextAgentTask({ agentId: "agent-claude-code" }, { vaultRoot: root, now: new Date("2026-04-19T03:00:00Z") });

      expect(response.claimed?.task.id).toBe("task-high");
      expect(response.claimed?.task.status).toBe("in-progress");
      expect(response.claimed?.contextFileContents).toEqual({});
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("returns null when no matching task is available", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-claim-next-empty-"));
    try {
      await seedVaultRoot(root);
      await writeTask(root, createTask("task-other-agent", { assignee: "agent-other" }));
      await writeTask(root, createTask("task-done", { status: "done", column: "done", progress: 100, completed_at: "2026-04-19T01:00:00Z" }));

      const response = await claimNextAgentTask({ agentId: "agent-claude-code" }, { vaultRoot: root });

      expect(response).toEqual({ claimed: null });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("respects board and priority filters while allowing unassigned tasks", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-claim-next-filtered-"));
    try {
      await seedVaultRoot(root);
      await writeTask(root, createTask("task-unassigned", { assignee: null, board_id: "board-beta", priority: "critical" }));
      await writeTask(root, createTask("task-alpha", { board_id: "board-alpha", priority: "critical" }));

      const response = await claimNextAgentTask({ agentId: "agent-claude-code", boardId: "board-beta", priority: "critical" }, { vaultRoot: root });

      expect(response.claimed?.task.id).toBe("task-unassigned");
      expect(response.claimed?.task.boardId).toBe("board-beta");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("is race-safe when two callers compete for one task", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-claim-next-race-"));
    try {
      await seedVaultRoot(root);
      await writeTask(root, createTask("task-only"));

      const [first, second] = await Promise.all([
        claimNextAgentTask({ agentId: "agent-claude-code" }, { vaultRoot: root, now: new Date("2026-04-19T04:00:00Z") }),
        claimNextAgentTask({ agentId: "agent-second" }, { vaultRoot: root, now: new Date("2026-04-19T04:00:00Z") }),
      ]);

      const claimedIds = [first.claimed?.task.id ?? null, second.claimed?.task.id ?? null];
      expect(claimedIds.filter((value) => value === "task-only")).toHaveLength(1);
      expect(claimedIds.filter((value) => value === null)).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
