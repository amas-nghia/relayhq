import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { spawnSubtaskFromBody } from "./spawn-subtask";

async function seedTask(root: string) {
  await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "projects"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "boards"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "columns"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "tasks"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "workspaces", "ws-demo.md"), `---\nid: "ws-demo"\ntype: "workspace"\nname: "Demo"\nowner_ids: ["@owner"]\nmember_ids: ["@owner"]\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "projects", "project-demo.md"), `---\nid: "project-demo"\ntype: "project"\nworkspace_id: "ws-demo"\nname: "Demo Project"\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "boards", "board-demo.md"), `---\nid: "board-demo"\ntype: "board"\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nname: "Demo Board"\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "columns", "todo.md"), `---\nid: "todo"\ntype: "column"\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nboard_id: "board-demo"\nname: "Todo"\nposition: 0\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "tasks", "task-parent.md"), `---\nid: "task-parent"\ntype: "task"\nversion: 1\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nboard_id: "board-demo"\ncolumn: "todo"\nstatus: "todo"\npriority: "high"\ntitle: "Parent task"\nassignee: "agent-claude-code"\ncreated_by: "@relayhq-web"\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\nheartbeat_at: null\nexecution_started_at: null\nexecution_notes: null\nprogress: 0\napproval_needed: false\napproval_requested_by: null\napproval_reason: null\napproved_by: null\napproved_at: null\napproval_outcome: "pending"\nblocked_reason: null\nblocked_since: null\nresult: null\ncompleted_at: null\nparent_task_id: null\ndepends_on: []\ntags: []\nlinks: []\nlocked_by: null\nlocked_at: null\nlock_expires_at: null\n---\n## Objective\n\nThis parent task body stays detailed enough for related subtask flows to inherit context safely.\n\n## Acceptance Criteria\n\n- Parent exists\n- Subtasks can be created\n\n## Context Files\n\n- docs/parent.md\n`, "utf8");
}

describe("POST /api/vault/tasks/:id/spawn-subtask", () => {
  test("creates a child task linked to its parent", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-spawn-subtask-"));

    try {
      await seedTask(root);

      const response = await spawnSubtaskFromBody("task-parent", {
        title: "Write subtask tests",
        objective: "Add focused regression tests for the spawned subtask flow without changing unrelated task lifecycle behavior.",
        acceptanceCriteria: ["Child task is written", "Parent link is preserved"],
        contextFiles: ["app/server/api/vault/tasks/[id]/spawn-subtask.ts"],
      }, { vaultRoot: root });

      expect(response.parentTaskId).toBe("task-parent");
      const childTaskContent = await readFile(join(root, response.sourcePath), "utf8");
      expect(childTaskContent).toContain('parent_task_id: "task-parent"');
      expect(childTaskContent).toContain('title: "Write subtask tests"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
