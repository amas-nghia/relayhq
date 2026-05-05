import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { promoteIssueCapture } from "./promote";

async function seedIssueCaptureTask(root: string, tags: string[] = ["issue-capture"]) {
  await mkdir(join(root, "vault", "shared", "tasks"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "tasks", "task-issue.md"), `---\nid: "task-issue"\ntype: "task"\nversion: 1\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nboard_id: "board-triage"\ncolumn: "triage"\nstatus: "todo"\npriority: "high"\ntitle: "Captured issue"\nassignee: "unassigned"\ncreated_by: "@alice"\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\nheartbeat_at: null\nexecution_started_at: null\nexecution_notes: null\nprogress: 0\napproval_needed: false\napproval_requested_by: null\napproval_reason: null\napproved_by: null\napproved_at: null\napproval_outcome: "pending"\nblocked_reason: null\nblocked_since: null\nresult: null\ncompleted_at: null\nparent_task_id: null\ndepends_on: []\ntags: ${JSON.stringify(tags)}\nlinks: []\nlocked_by: null\nlocked_at: null\nlock_expires_at: null\n---\nInitial report details.\n`, "utf8");
}

describe("POST /api/vault/tasks/[id]/promote", () => {
  test("promotes an issue capture task into a normal task", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-promote-route-"));

    try {
      process.env.RELAYHQ_VAULT_ROOT = root;
      await seedIssueCaptureTask(root);

      const result = await promoteIssueCapture("task-issue", {
        boardId: "board-demo",
        columnId: "todo",
        assignee: "agent-backend-dev",
        objective: "Investigate and fix the reported issue.",
        acceptanceCriteria: ["Repro is documented", "Fix is validated"],
      });

      expect(result.task).toMatchObject({
        id: "task-issue",
        status: "todo",
        assignee: "agent-backend-dev",
        boardId: "board-demo",
        columnId: "todo",
      });

      const content = await readFile(join(root, "vault", "shared", "tasks", "task-issue.md"), "utf8");
      expect(content).toContain('tags: []');
      expect(content).toContain("## Objective");
      expect(content).toContain("## Acceptance Criteria");
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("returns 404 when the source task is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-promote-route-"));

    try {
      process.env.RELAYHQ_VAULT_ROOT = root;
      await mkdir(join(root, "vault", "shared", "tasks"), { recursive: true });

      await expect(promoteIssueCapture("task-missing", {
        boardId: "board-demo",
        columnId: "todo",
        assignee: "agent-backend-dev",
        objective: "Investigate and fix the reported issue.",
        acceptanceCriteria: ["Repro is documented"],
      })).rejects.toMatchObject({
        statusCode: 404,
        statusMessage: "Task task-missing was not found.",
      });
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects already-promoted normal tasks", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-promote-route-"));

    try {
      process.env.RELAYHQ_VAULT_ROOT = root;
      await seedIssueCaptureTask(root, ["bug-fix"]);

      await expect(promoteIssueCapture("task-issue", {
        boardId: "board-demo",
        columnId: "todo",
        assignee: "agent-backend-dev",
        objective: "Investigate and fix the reported issue.",
        acceptanceCriteria: ["Repro is documented"],
      })).rejects.toMatchObject({
        statusCode: 400,
        statusMessage: "Task task-issue is already a normal task.",
      });
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });
});
