import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import type {
  ActiveAgentSession,
  AgentContextResponse,
  VaultReadModel,
} from "../../../web/src/api/contract";
import { readActiveAgents } from "./agent/active.get";
import { readAgentContext } from "./agent/context.get";
import { listVaultIssues } from "./vault/issues/index.get";
import { readVaultIssue } from "./vault/issues/[id].get";
import { readCanonicalVaultReadModel } from "../services/vault/read";
import { SessionStore } from "../services/session/store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  delete process.env.RELAYHQ_VAULT_ROOT;
});

async function seedVault(root: string) {
  await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "projects"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "boards"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "columns"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "tasks"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "issues"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "docs"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "agents"), { recursive: true });

  await writeFile(join(root, "vault", "shared", "workspaces", "ws-demo.md"), `---\nid: "ws-demo"\ntype: "workspace"\nname: "Demo Workspace"\nowner_ids: ["@owner"]\nmember_ids: ["@owner"]\ncreated_at: "2026-04-24T00:00:00Z"\nupdated_at: "2026-04-24T00:00:00Z"\n---\n# Demo Workspace\n\nWorkspace brief.\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "projects", "project-demo.md"), `---\nid: "project-demo"\ntype: "project"\nworkspace_id: "ws-demo"\nname: "Demo Project"\ncodebases: [{"name":"web","path":"../web","primary":true}]\ncreated_at: "2026-04-24T00:00:00Z"\nupdated_at: "2026-04-24T00:00:00Z"\n---\n# Demo Project\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "boards", "board-demo.md"), `---\nid: "board-demo"\ntype: "board"\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nname: "Demo Board"\ncreated_at: "2026-04-24T00:00:00Z"\nupdated_at: "2026-04-24T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "columns", "todo.md"), `---\nid: "todo"\ntype: "column"\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nboard_id: "board-demo"\nname: "Todo"\nposition: 0\ncreated_at: "2026-04-24T00:00:00Z"\nupdated_at: "2026-04-24T00:00:00Z"\n---\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "tasks", "task-demo.md"), `---\nid: "task-demo"\ntype: "task"\nversion: 1\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nboard_id: "board-demo"\ncolumn: "todo"\nstatus: "todo"\npriority: "high"\ntitle: "Demo task"\nassignee: "agent-claude-code"\ncreated_by: "@owner"\ncreated_at: "2026-04-24T00:00:00Z"\nupdated_at: "2026-04-24T00:00:00Z"\nheartbeat_at: null\nexecution_started_at: null\nexecution_notes: null\nprogress: 0\napproval_needed: false\napproval_requested_by: null\napproval_reason: null\napproved_by: null\napproved_at: null\napproval_outcome: "pending"\nblocked_reason: null\nblocked_since: null\nresult: null\ncompleted_at: null\nparent_task_id: null\ndepends_on: []\ntags: []\nlinks: []\nlocked_by: null\nlocked_at: null\nlock_expires_at: null\n---\n## Objective\n\nDemo objective.\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "issues", "issue-demo.md"), `---\nid: "issue-demo"\ntype: "issue"\nversion: 1\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\nstatus: "open"\npriority: "high"\ntitle: "Demo issue"\nreported_by: "@owner"\ndiscovered_during_task_id: null\nlinked_task_ids: ["task-demo"]\ntags: ["demo"]\ncreated_at: "2026-04-24T00:00:00Z"\nupdated_at: "2026-04-24T00:00:00Z"\n---\n## Problem\nThe system needs a demo issue.\n\n## Context\nInitial context block.\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "docs", "doc-demo.md"), `---\nid: "doc-demo"\ntype: "doc"\ndoc_type: "feature"\nworkspace_id: "ws-demo"\nproject_id: "project-demo"\ntitle: "Demo doc"\nstatus: "draft"\nvisibility: "project"\naccess_roles: ["all"]\nsensitive: false\ncreated_at: "2026-04-24T00:00:00Z"\nupdated_at: "2026-04-24T00:00:00Z"\ntags: ["demo"]\n---\n# Demo doc\n`, "utf8");
  await writeFile(join(root, "vault", "shared", "agents", "agent-claude-code.md"), `---\nid: "agent-claude-code"\ntype: "agent"\nname: "Claude Code"\nrole: "implementation"\nroles: ["implementation"]\nprovider: "anthropic"\nmodel: "claude-sonnet-4-6"\ncapabilities: ["write-typescript"]\ntask_types_accepted: ["feature-implementation"]\napproval_required_for: []\ncannot_do: []\naccessible_by: ["@owner"]\nskill_file: "skills/claude-code.md"\nstatus: "available"\nworkspace_id: "ws-demo"\ncreated_at: "2026-04-24T00:00:00Z"\nupdated_at: "2026-04-24T00:00:00Z"\n---\n`, "utf8");
}

describe("BE contract alignment", () => {
  test("aligns read-model, context, active sessions, and issue endpoints with FE contract", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-contract-"));
    roots.push(root);
    process.env.RELAYHQ_VAULT_ROOT = root;
    await seedVault(root);

    const model = await readCanonicalVaultReadModel(root);
    const typedModel: VaultReadModel = model;
    expect(typedModel.projects[0]?.codebases).toEqual([{ name: "web", path: "../web", primary: true }]);

    const sessionStore = new SessionStore({ tokenFactory: () => 'sess-demo' });
    sessionStore.issue('agent-claude-code', new Date('2026-04-24T00:00:00Z'));
    const activeSessions: ReadonlyArray<ActiveAgentSession> = readActiveAgents({ sessionStore, now: () => new Date('2026-04-24T00:01:00Z') });
    expect(activeSessions).toHaveLength(1);

    const context: AgentContextResponse = await readAgentContext({
      readModelReader: async () => model,
      resolveRoot: () => root,
      workspaceIdReader: () => null,
      sessionStore,
      now: () => new Date('2026-04-24T00:01:00Z'),
    });
    expect(context.projects[0]?.codebases).toEqual([{ name: "web", path: "../web", primary: true }]);

    const issues = await listVaultIssues({ projectId: 'project-demo' });
    expect(issues.issues[0]).toMatchObject({ id: 'issue-demo', linkedTaskIds: ['task-demo'] });

    const issue = await readVaultIssue('issue-demo');
    expect(issue).toMatchObject({ id: 'issue-demo', projectId: 'project-demo', linkedTaskIds: ['task-demo'] });
  });
});
