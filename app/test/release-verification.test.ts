import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import type { VaultReadModel as FrontendVaultReadModel } from "../../web/src/api/contract";
import { listAgentSessions } from "../server/api/agent/[id]/sessions.get";
import { readAgentSession, type AgentSessionFullResponse } from "../server/api/agent/session.get";
import { readSettingsState } from "../server/api/settings.get";
import { listVaultDocs } from "../server/api/vault/docs/index.get";
import { patchVaultTask } from "../server/api/vault/tasks/[id]";
import { createVaultTaskFromBody } from "../server/api/vault/tasks.post";
import { SessionStore } from "../server/services/session/store";
import { readCanonicalVaultReadModel } from "../server/services/vault/read";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  delete process.env.RELAYHQ_VAULT_ROOT;
  delete process.env.RELAYHQ_WORKSPACE_ID;
  delete process.env.RELAYHQ_DISABLE_AUTO_DISPATCH;
});

async function createReleaseRoot() {
  const root = await mkdtemp(join(tmpdir(), "relayhq-release-verify-"));
  roots.push(root);

  await Promise.all([
    mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true }),
    mkdir(join(root, "vault", "shared", "projects"), { recursive: true }),
    mkdir(join(root, "vault", "shared", "boards"), { recursive: true }),
    mkdir(join(root, "vault", "shared", "columns"), { recursive: true }),
    mkdir(join(root, "vault", "shared", "tasks"), { recursive: true }),
    mkdir(join(root, "vault", "shared", "docs"), { recursive: true }),
    mkdir(join(root, "vault", "shared", "agents"), { recursive: true }),
    mkdir(join(root, "docs"), { recursive: true }),
  ]);

  await Promise.all([
    writeFile(join(root, "docs", "release-smoke.md"), "release verification context", "utf8"),
    writeFile(join(root, "vault", "shared", "workspaces", "ws-demo.md"), [
      "---",
      'id: "ws-demo"',
      'type: "workspace"',
      'name: "Demo Workspace"',
      'owner_ids: ["@owner"]',
      'member_ids: ["@owner"]',
      'created_at: "2026-05-01T00:00:00Z"',
      'updated_at: "2026-05-01T00:00:00Z"',
      "---",
      "# Demo Workspace",
      "",
      "Release verification workspace brief.",
      "",
    ].join("\n"), "utf8"),
    writeFile(join(root, "vault", "shared", "projects", "project-demo.md"), [
      "---",
      'id: "project-demo"',
      'type: "project"',
      'workspace_id: "ws-demo"',
      'name: "Demo Project"',
      'codebases: [{"name":"app","path":"./app","primary":true}]',
      'created_at: "2026-05-01T00:00:00Z"',
      'updated_at: "2026-05-01T00:00:00Z"',
      "---",
      "# Demo Project",
      "",
    ].join("\n"), "utf8"),
    writeFile(join(root, "vault", "shared", "boards", "board-demo.md"), [
      "---",
      'id: "board-demo"',
      'type: "board"',
      'workspace_id: "ws-demo"',
      'project_id: "project-demo"',
      'name: "Demo Board"',
      'created_at: "2026-05-01T00:00:00Z"',
      'updated_at: "2026-05-01T00:00:00Z"',
      "---",
      "",
    ].join("\n"), "utf8"),
    writeFile(join(root, "vault", "shared", "columns", "todo.md"), [
      "---",
      'id: "todo"',
      'type: "column"',
      'workspace_id: "ws-demo"',
      'project_id: "project-demo"',
      'board_id: "board-demo"',
      'name: "Todo"',
      "position: 0",
      'created_at: "2026-05-01T00:00:00Z"',
      'updated_at: "2026-05-01T00:00:00Z"',
      "---",
      "",
    ].join("\n"), "utf8"),
    writeFile(join(root, "vault", "shared", "agents", "agent-claude-code.md"), [
      "---",
      'id: "agent-claude-code"',
      'type: "agent"',
      'name: "Claude Code"',
      'role: "implementation"',
      'roles: ["implementation"]',
      'provider: "anthropic"',
      'model: "claude-sonnet-4-6"',
      'capabilities: ["write-code","run-tests"]',
      'task_types_accepted: ["feature-implementation","bug-fix"]',
      'approval_required_for: []',
      'cannot_do: []',
      'accessible_by: ["@owner"]',
      'skill_file: "skills/agent-claude-code.md"',
      'status: "available"',
      'workspace_id: "ws-demo"',
      'created_at: "2026-05-01T00:00:00Z"',
      'updated_at: "2026-05-01T00:00:00Z"',
      "---",
      "",
    ].join("\n"), "utf8"),
    writeFile(join(root, "vault", "shared", "docs", "doc-open.md"), [
      "---",
      'id: "doc-open"',
      'type: "doc"',
      'doc_type: "brief"',
      'workspace_id: "ws-demo"',
      'project_id: "project-demo"',
      'title: "Release Brief"',
      'status: "draft"',
      'visibility: "project"',
      'access_roles: ["all"]',
      'sensitive: false',
      'created_at: "2026-05-01T00:00:00Z"',
      'updated_at: "2026-05-01T00:00:00Z"',
      'tags: ["release"]',
      "---",
      "Visible to agents.",
      "",
    ].join("\n"), "utf8"),
    writeFile(join(root, "vault", "shared", "docs", "doc-human.md"), [
      "---",
      'id: "doc-human"',
      'type: "doc"',
      'doc_type: "policy"',
      'workspace_id: "ws-demo"',
      'project_id: "project-demo"',
      'title: "Human-only Runbook"',
      'status: "active"',
      'visibility: "workspace"',
      'access_roles: ["human-only"]',
      'sensitive: false',
      'created_at: "2026-05-01T00:00:00Z"',
      'updated_at: "2026-05-01T00:00:00Z"',
      'tags: ["ops"]',
      "---",
      "Hidden from agents.",
      "",
    ].join("\n"), "utf8"),
  ]);

  return root;
}

describe("release verification batch", () => {
  test("covers core backend release flows against seeded local state", async () => {
    const root = await createReleaseRoot();
    const sessionStore = new SessionStore({ tokenFactory: () => "sess-release-verify" });
    process.env.RELAYHQ_VAULT_ROOT = root;
    process.env.RELAYHQ_WORKSPACE_ID = "ws-demo";
    process.env.RELAYHQ_DISABLE_AUTO_DISPATCH = "true";

    const created = await createVaultTaskFromBody({
      title: "Run release verification batch",
      projectId: "project-demo",
      boardId: "board-demo",
      columnId: "todo",
      priority: "high",
      assignee: "agent-claude-code",
      objective: "Exercise the release-critical backend verification flow against deterministic local vault state and capture whether the seeded environment remains release-ready.",
      acceptanceCriteria: [
        "Task create path succeeds against seeded state",
        "Session bootstrap returns deterministic context for the assigned task",
      ],
      contextFiles: ["docs/release-smoke.md"],
      tags: ["feature-implementation"],
    });

    await patchVaultTask(created.taskId, {
      actorId: "@owner",
      patch: {
        progress: 25,
        execution_notes: "release smoke in progress",
      },
    }, {
      resolveVaultWorkspaceRoot: () => root,
    });

    const session = await readAgentSession({
      agent: "agent-claude-code",
      taskId: created.taskId,
      inlineContextFiles: true,
    }, {
      resolveRoot: () => root,
      sessionStore,
      workspaceIdReader: () => "ws-demo",
    });
    const fullSession = session as AgentSessionFullResponse;

    const sessions = await listAgentSessions("agent-claude-code", {}, {
      resolveRoot: () => root,
      activeSessionsReader: () => ([{
        id: "runner-live",
        sessionId: "runner-live",
        agentName: "agent-claude-code",
        taskId: created.taskId,
        provider: "anthropic",
        runtimeKind: "claude-code",
        launchSurface: "background",
        launchMode: "fresh",
        resumedFromSessionId: null,
        status: "running",
        command: "claude",
        cwd: null,
        startTime: "2026-05-01T00:00:00.000Z",
        lastEventAt: "2026-05-01T00:01:00.000Z",
      }] as never),
      recordedSessionsReader: async () => ([{
        sessionId: "runner-finished",
        agentId: "agent-claude-code",
        taskId: created.taskId,
        launchMode: "resume",
        runtimeKind: "claude-code",
        command: "claude -p",
        startTime: "2026-04-30T23:00:00.000Z",
        lastEventAt: "2026-04-30T23:10:00.000Z",
        status: "completed",
      }]),
    });

    const docs = await listVaultDocs({ access: "mine", agent_id: "agent-claude-code" }, { vaultRoot: root });
    const settings = await readSettingsState({
      cwd: join(root, "app"),
      env: { ...process.env, RELAYHQ_VAULT_ROOT: root, RELAYHQ_WORKSPACE_ID: "ws-demo" },
    });
    const model = await readCanonicalVaultReadModel(root);
    const typedModel: FrontendVaultReadModel = model;

    expect(created.taskId).toStartWith("task-");
    expect(typedModel.projects[0]?.codebases).toEqual([{ name: "app", path: "./app", primary: true }]);
    expect(typedModel.tasks.some((task) => task.id === created.taskId && task.progress === 25)).toBe(true);
    expect(fullSession.protocol).toEqual({
      workspaceBrief: "# Demo Workspace\n\nRelease verification workspace brief.",
      warning: null,
    });
    expect(fullSession.bootstrap).not.toBeNull();
    expect((fullSession.bootstrap as Exclude<typeof fullSession.bootstrap, null | { changed: false; etag: string }>).contextFileContents).toEqual({
      "docs/release-smoke.md": "release verification context",
    });
    expect(sessions.map((entry) => entry.sessionId)).toEqual(["runner-live", "runner-finished"]);
    expect(docs.data.map((doc) => doc.id)).toEqual(["doc-open"]);
    expect(settings).toEqual(expect.objectContaining({
      activeWorkspaceId: "ws-demo",
      activeWorkspaceName: "Demo Workspace",
      isValid: true,
      maxConcurrentRuntimeInstances: 5,
    }));
  });
});
