import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { appendTaskComment, readTaskThread } from "../../../../services/vault/task-comments";

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
  await writeFile(join(root, "vault", "shared", "tasks", "task-demo.md"), `---\nid: "task-demo"\ntype: "task"\nversion: 1\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nboard_id: "board-demo"\ncolumn: "todo"\nstatus: "todo"\npriority: "high"\ntitle: "Demo task"\nassignee: "agent-claude-code"\ncreated_by: "@relayhq-web"\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\nheartbeat_at: null\nexecution_started_at: null\nexecution_notes: null\nprogress: 0\napproval_needed: false\napproval_requested_by: null\napproval_reason: null\napproved_by: null\napproved_at: null\napproval_outcome: "pending"\nblocked_reason: null\nblocked_since: null\nresult: null\ncompleted_at: null\nparent_task_id: null\ndepends_on: []\ntags: []\nlinks: []\nlocked_by: null\nlocked_at: null\nlock_expires_at: null\n---\n## Objective\n\nThis task is long enough to support comment thread coverage in tests.\n\n## Acceptance Criteria\n\n- Comments can be appended\n- Links are preserved\n\n## Context Files\n\n- docs/comments.md\n`, "utf8");
}

describe("task comments thread helpers", () => {
  test("creates a thread file, appends comments, and links the task", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-task-comments-"));

    try {
      await seedTask(root);

      const initialThread = await readTaskThread("task-demo", { vaultRoot: root });
      expect(initialThread.comments).toEqual([]);

      const updatedThread = await appendTaskComment("task-demo", {
        author: "@relayhq-web",
        body: "First implementation note.",
        now: new Date("2026-04-20T12:00:00Z"),
        vaultRoot: root,
      });

      expect(updatedThread.id).toBe("thread-task-demo");
      expect(updatedThread.comments).toEqual([
        expect.objectContaining({ author: "@relayhq-web", body: "First implementation note." }),
      ]);

      await expect(readFile(join(root, "vault", "shared", "threads", "thread-task-demo.md"), "utf8")).resolves.toContain("### @relayhq-web | 2026-04-20T12:00:00.000Z");
      await expect(readFile(join(root, "vault", "shared", "tasks", "task-demo.md"), "utf8")).resolves.toContain('"thread-task-demo"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
