import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { createTaskTemplate } from "../../services/vault/task-templates";
import { createVaultTaskFromBody } from "./tasks.post";

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

describe("POST /api/vault/tasks validation", () => {
  test("rejects under-specified tasks", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-vault-task-input-"));
    try {
      process.env.RELAYHQ_VAULT_ROOT = root;
      await seedBoard(root);

      await expect(createVaultTaskFromBody({
        title: "Thin task",
        projectId: "project-demo",
        boardId: "board-demo",
        columnId: "todo",
        priority: "high",
        assignee: "agent-claude-code",
        objective: "too short",
        acceptanceCriteria: ["One item"],
        contextFiles: [],
      })).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "objective: must be at least 50 characters, acceptanceCriteria: must contain at least 2 items, contextFiles: must contain at least 1 item",
      });
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("can hydrate task details from a saved template", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-vault-task-template-"));
    try {
      process.env.RELAYHQ_VAULT_ROOT = root;
      await seedBoard(root);
      await createTaskTemplate({
        name: "Bug Fix",
        title: "Fix a bug",
        objective: "Resolve the reported bug while preserving nearby behavior and documenting the regression coverage that proves the fix.",
        acceptanceCriteria: "Bug reproduces before fix\nBug is gone after fix",
        contextFiles: "app/server/api/\nweb/src/pages/",
        constraints: "Do not change unrelated flows",
      }, { vaultRoot: root });

      const response = await createVaultTaskFromBody({
        title: "Apply bug fix template",
        projectId: "project-demo",
        boardId: "board-demo",
        columnId: "todo",
        priority: "high",
        assignee: "agent-claude-code",
        templateId: "bug-fix",
      });

      expect(response.taskId).toStartWith("task-");
      await expect(readFile(join(root, response.sourcePath), "utf8")).resolves.toContain("## Acceptance Criteria");
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("accepts recurring tasks with a cron schedule", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-vault-task-cron-"));
    try {
      process.env.RELAYHQ_VAULT_ROOT = root;
      await seedBoard(root);

      const response = await createVaultTaskFromBody({
        title: "Generate daily summary",
        projectId: "project-demo",
        boardId: "board-demo",
        columnId: "todo",
        priority: "medium",
        assignee: "agent-claude-code",
        objective: "Generate the daily summary and keep the workflow scheduled for the next business day so the team receives a fresh run every morning.",
        acceptanceCriteria: ["Task is created", "Task is scheduled for the next run"],
        contextFiles: ["docs/standup.md"],
        cron_schedule: "0 9 * * 1-5",
      });

      const file = await readFile(join(root, response.sourcePath), "utf8");
      expect(file).toContain('cron_schedule: "0 9 * * 1-5"');
      expect(file).toContain('status: "scheduled"');
      expect(file).toContain('next_run_at:');
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });
});
