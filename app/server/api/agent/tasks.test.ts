import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { readTaskBootstrapPack } from "./bootstrap/[taskId].get";
import { createAgentTasks } from "./tasks.post";

async function seedBoard(root: string) {
  await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "projects"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "boards"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "columns"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "tasks"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "workspaces", "ws-demo.md"), `---\nid: "ws-demo"\ntype: "workspace"\nname: "Demo"\nowner_ids: ["@owner"]\nmember_ids: ["@owner"]\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "projects", "project-demo.md"), `---\nid: "project-demo"\ntype: "project"\nworkspace_id: "ws-demo"\nname: "Demo Project"\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "boards", "board-demo.md"), `---\nid: "board-demo"\ntype: "board"\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nname: "Demo Board"\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "columns", "todo.md"), `---\nid: "todo"\ntype: "column"\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nboard_id: "board-demo"\nname: "Todo"\nposition: 0\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
}

describe("POST /api/agent/tasks", () => {
  test("creates and deduplicates proposals", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-agent-tasks-"));
    try {
      delete process.env.RELAYHQ_WORKSPACE_ID;
      process.env.RELAYHQ_VAULT_ROOT = root;
      await seedBoard(root);
      const response = await createAgentTasks({
        tasks: [{
          title: "Ship planner",
          priority: "high",
          boardId: "board-demo",
          objective: "Implement the planner endpoint and return structured context for the current workspace.",
          acceptanceCriteria: ["Return planner context", "Keep response stable"],
          contextFiles: ["app/server/api/agent/tasks.post.ts"],
        }],
      }, { vaultRoot: root, now: new Date("2026-04-19T00:00:00Z") });
      expect(response.created).toHaveLength(1);
      const duplicate = await createAgentTasks({
        tasks: [{
          title: "Ship planner",
          priority: "high",
          boardId: "board-demo",
          objective: "Implement the planner endpoint and return structured context for the current workspace.",
          acceptanceCriteria: ["Return planner context", "Keep response stable"],
          contextFiles: ["app/server/api/agent/tasks.post.ts"],
        }],
      }, { vaultRoot: root });
      expect(duplicate.skipped).toHaveLength(1);
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("builds structured body fields and bootstrap parses them", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-agent-task-structured-"));
    try {
      delete process.env.RELAYHQ_WORKSPACE_ID;
      process.env.RELAYHQ_VAULT_ROOT = root;
      await seedBoard(root);

      const response = await createAgentTasks({
        tasks: [{
          title: "Ship planner",
          priority: "high",
          boardId: "board-demo",
          objective: "Implement planner flow and return a structured bootstrap payload for the current workspace.",
          acceptanceCriteria: ["Return structured tasks", "Store the task body in canonical markdown"],
          constraints: ["Do not break planner API"],
          contextFiles: ["app/server/api/agent/tasks.post.ts"],
        }],
      }, { vaultRoot: root, now: new Date("2026-04-19T00:00:00Z") });

      const taskId = response.created[0]?.id;
      expect(taskId).toBeDefined();
      const taskFile = await readFile(join(root, "vault", "shared", "tasks", `${taskId}.md`), "utf8");
      expect(taskFile).toContain("## Acceptance Criteria");
      expect(taskFile).toContain("## Constraints");
      expect(taskFile).toContain("## Context Files");

      const pack = await readTaskBootstrapPack(taskId!, {
        readModelReader: async () => readCanonicalVaultReadModel(root),
        resolveRoot: () => root,
        workspaceIdReader: () => null,
      });

      expect(pack.acceptanceCriteria).toEqual(["Return structured tasks", "Store the task body in canonical markdown"]);
      expect(pack.constraints).toEqual(["Do not break planner API"]);
      expect(pack.contextFiles).toEqual(["app/server/api/agent/tasks.post.ts"]);
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });

    test("returns per-task validation errors without failing the whole batch", async () => {
      const root = await mkdtemp(join(tmpdir(), "relayhq-agent-task-validation-"));
      try {
        delete process.env.RELAYHQ_WORKSPACE_ID;
        process.env.RELAYHQ_VAULT_ROOT = root;
        await seedBoard(root);

        const response = await createAgentTasks({
          tasks: [{
            title: "Thin task",
            priority: "high",
            boardId: "board-demo",
            objective: "Short goal",
            acceptanceCriteria: ["Only one item"],
          }],
        }, { vaultRoot: root, now: new Date("2026-04-19T00:00:00Z") });

        expect(response.created).toHaveLength(0);
        expect(response.errors).toEqual([
          {
            title: "Thin task",
            error: "objective: must be at least 50 characters, acceptanceCriteria: must contain at least 2 items, contextFiles: must contain at least 1 item",
          },
        ]);
      } finally {
        delete process.env.RELAYHQ_VAULT_ROOT;
        await rm(root, { recursive: true, force: true });
    }
  });

  test("returns empty warnings for a fully specified task", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-agent-task-no-warnings-"));
    try {
      delete process.env.RELAYHQ_WORKSPACE_ID;
      process.env.RELAYHQ_VAULT_ROOT = root;
      await seedBoard(root);

      const response = await createAgentTasks({
        tasks: [{
          title: "Well-specified task",
          priority: "high",
          boardId: "board-demo",
          objective: "Implement the planner context endpoint and return workspace, board, and agent metadata.",
          acceptanceCriteria: ["Return planner context", "Keep response backward compatible"],
          constraints: ["Do not add dependencies"],
          contextFiles: ["app/server/api/agent/planner-context.get.ts"],
        }],
      }, { vaultRoot: root, now: new Date("2026-04-19T00:00:00Z") });

      expect(response.created).toHaveLength(1);
      expect(response.created[0]?.warnings).toEqual([]);
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });
});
