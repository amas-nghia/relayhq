import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { scheduleVaultTask } from "./schedule.post";

async function seedTask(root: string) {
  await mkdir(join(root, "vault", "shared", "tasks"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "tasks", "task-demo.md"), `---\nid: "task-demo"\ntype: "task"\nversion: 1\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nboard_id: "board-demo"\ncolumn: "todo"\nstatus: "todo"\npriority: "high"\ntitle: "Demo task"\nassignee: "agent-claude-code"\ncreated_by: "@owner"\ncreated_at: "2026-04-24T00:00:00Z"\nupdated_at: "2026-04-24T00:00:00Z"\nheartbeat_at: null\nexecution_started_at: null\nexecution_notes: null\nprogress: 0\nnext_run_at: null\napproval_needed: false\napproval_requested_by: null\napproval_reason: null\napproved_by: null\napproved_at: null\napproval_outcome: "pending"\nblocked_reason: null\nblocked_since: null\nresult: null\ncompleted_at: null\nparent_task_id: null\ndepends_on: []\ntags: []\nlinks: []\nlocked_by: null\nlocked_at: null\nlock_expires_at: null\n---\n## Objective\n\nDemo objective.\n`, "utf8");
}

describe("POST /api/vault/tasks/[id]/schedule", () => {
  test("rejects non-future schedule timestamps", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-schedule-route-"));
    try {
      process.env.RELAYHQ_VAULT_ROOT = root;
      await seedTask(root);

      await expect(scheduleVaultTask("task-demo", {
        actorId: "agent-claude-code",
        nextRunAt: "2020-01-01T00:00:00Z",
      })).rejects.toMatchObject({ statusCode: 400, statusMessage: "nextRunAt must be in the future." });
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("schedules a task for later execution", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-schedule-route-"));
    try {
      process.env.RELAYHQ_VAULT_ROOT = root;
      await seedTask(root);

      const result = await scheduleVaultTask("task-demo", {
        actorId: "agent-claude-code",
        nextRunAt: "2099-01-01T00:00:00Z",
      });

      expect(result.frontmatter.status).toBe("scheduled");
      expect(result.frontmatter.next_run_at).toBe("2099-01-01T00:00:00Z");
      expect(result.frontmatter.locked_by).toBeNull();
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });
});
