import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { listVaultIssues } from "./index.get";
import { createVaultIssue } from "./index.post";
import { patchVaultIssue } from "./[id].patch";
import { readVaultIssue } from "./[id].get";
import { createIssueComment } from "./[id]/comments.post";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  delete process.env.RELAYHQ_VAULT_ROOT;
});

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "relayhq-issues-"));
  roots.push(root);
  await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "projects"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "issues"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "workspaces", "ws-demo.md"), `---\nid: "ws-demo"\ntype: "workspace"\nname: "Demo"\nowner_ids: ["@owner"]\nmember_ids: ["@owner"]\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "projects", "project-demo.md"), `---\nid: "project-demo"\ntype: "project"\nworkspace_id: "ws-demo"\nname: "Demo Project"\ncodebase_root: null\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "issues", "issue-existing.md"), `---\nid: "issue-existing"\ntype: "issue"\nversion: 1\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nstatus: "open"\npriority: "high"\ntitle: "Existing issue"\nreported_by: "@alice"\ndiscovered_during_task_id: null\nlinked_task_ids: []\ntags: ["triage"]\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n\n## Problem\n\nProblem text\n\n## Context\n\nContext text\n`, "utf8");
  process.env.RELAYHQ_VAULT_ROOT = root;
  return root;
}

describe("vault issues routes", () => {
  test("GET requires projectId and lists project issues", async () => {
    await createRoot();
    const response = await listVaultIssues({}).catch((error: any) => error);
    expect(response.statusCode).toBe(422);

    const ok = await listVaultIssues({ projectId: "project-demo" });
    expect(ok.issues).toHaveLength(1);
    expect(ok.issues[0].id).toBe("issue-existing");
  });

  test("POST creates a new issue markdown file", async () => {
    const root = await createRoot();
    const response = await createVaultIssue({ projectId: "project-demo", title: "New issue", problem: "Investigate me" });
    expect(response.issue.title).toBe("New issue");
    const files = await readFile(join(root, "vault", "shared", "issues", `${response.issue.id}.md`), "utf8");
    expect(files).toContain("## Problem");
  });

  test("PATCH updates metadata and GET /[id] returns structured body fields", async () => {
    await createRoot();
    const patched = await patchVaultIssue("issue-existing", { actorId: "agent-claude-code", patch: { status: "investigating", linked_task_ids: ["task-1"], problem: "Updated problem" } });
    expect(patched.issue.status).toBe("investigating");
    expect(patched.issue.linkedTaskIds).toEqual(["task-1"]);

    const detail = await readVaultIssue("issue-existing");
    expect(detail.problem).toBe("Updated problem");
    expect(detail.linkedTaskIds).toEqual(["task-1"]);
  });

  test("PATCH rejects invalid status transitions", async () => {
    await createRoot();

    await expect(
      patchVaultIssue("issue-existing", { actorId: "agent-claude-code", patch: { status: "resolved" } }),
    ).rejects.toMatchObject({ statusCode: 422 });
  });

  test("POST comments appends an issue comment and returns it from GET /[id]", async () => {
    await createRoot();

    const response = await createIssueComment("issue-existing", {
      actorId: "agent-claude-code",
      body: "I can reproduce this in the seeded vault.",
    });

    expect(response.comment).toEqual({
      author: "agent-claude-code",
      timestamp: expect.any(String),
      body: "I can reproduce this in the seeded vault.",
    });

    const detail = await readVaultIssue("issue-existing");
    expect(detail.comments).toEqual([
      {
        author: "agent-claude-code",
        timestamp: expect.any(String),
        body: "I can reproduce this in the seeded vault.",
      },
    ]);
  });
});
