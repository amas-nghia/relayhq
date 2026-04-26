import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../models/read-model";
import { SessionStore } from "../../services/session/store";
import { computeSessionEtag, readAgentSession, type AgentSessionFullResponse } from "./session.get";

function expectFullResponse(response: Awaited<ReturnType<typeof readAgentSession>>): AgentSessionFullResponse {
  expect("changed" in response).toBe(false);
  return response as AgentSessionFullResponse;
}

function createTask(id: string, overrides: Partial<VaultReadModel["tasks"][number]> = {}): VaultReadModel["tasks"][number] {
  return {
    id,
    type: "task",
    workspaceId: "ws-demo",
    projectId: "project-demo",
    boardId: "board-demo",
    columnId: "todo",
    status: "todo",
    priority: "high",
    title: `Task ${id}`,
    assignee: "agent-claude-code",
    createdBy: "@alice",
    createdAt: "2026-04-23T12:00:00Z",
    updatedAt: "2026-04-23T12:00:00Z",
    heartbeatAt: null,
    executionStartedAt: null,
    executionNotes: null,
    progress: 0,
    nextRunAt: null,
    approvalNeeded: false,
    approvalRequestedBy: null,
    approvalReason: null,
    approvedBy: null,
    approvedAt: null,
    approvalOutcome: "pending",
    blockedReason: null,
    blockedSince: null,
    result: null,
    completedAt: null,
    parentTaskId: null,
    dependsOn: [],
    tags: [],
    links: [],
    lockedBy: null,
    lockedAt: null,
    lockExpiresAt: null,
    isStale: false,
    approvalIds: [],
    approvalState: {
      status: "not-needed",
      needed: false,
      outcome: "pending",
      requestedBy: null,
      requestedAt: null,
      decidedBy: null,
      decidedAt: null,
      reason: null,
    },
    body: "",
    sourcePath: `vault/shared/tasks/${id}.md`,
    ...overrides,
  };
}

function createReadModel(): VaultReadModel {
  return {
    workspaces: [{ id: "ws-demo", type: "workspace", name: "Demo", ownerIds: [], memberIds: [], projectIds: [], boardIds: [], columnIds: [], taskIds: [], approvalIds: [], createdAt: "2026", updatedAt: "2026", body: "", sourcePath: "vault/shared/workspaces/ws-demo.md" }],
    projects: [],
    boards: [],
    columns: [],
    tasks: [createTask("task-1")],
    docs: [],
    approvals: [],
    auditNotes: [],
    agents: [],
  };
}

describe("GET /api/agent/session", () => {
  test("includes vaultRoot only when configured outside the default repo root", async () => {
    const sessionStore = new SessionStore({ tokenFactory: () => "sess-fixed0001" });
    const previousRoot = process.env.RELAYHQ_VAULT_ROOT;
    process.env.RELAYHQ_VAULT_ROOT = "/external/vault";
    try {
      const response = await readAgentSession({ agent: "agent-claude-code" }, {
        resolveRoot: () => "/external/vault",
        readModelReader: async () => createReadModel(),
        sessionStore,
        workspaceIdReader: () => null,
      });

      expect(response.vaultRoot).toBe("/external/vault");
      expect(response.sessionToken).toBe("sess-fixed0001");
    } finally {
      if (previousRoot === undefined) {
        delete process.env.RELAYHQ_VAULT_ROOT;
      } else {
        process.env.RELAYHQ_VAULT_ROOT = previousRoot;
      }
    }
  });

  test("issues a new session token when the request does not provide one", async () => {
    const sessionStore = new SessionStore({ tokenFactory: () => "sess-new0001" });

    const response = await readAgentSession({ agent: "agent-claude-code" }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      sessionStore,
      workspaceIdReader: () => null,
      now: () => new Date("2026-04-23T12:00:00Z"),
    });
    const fullResponse = expectFullResponse(response);

    expect(fullResponse.sessionToken).toBe("sess-new0001");
    expect(fullResponse.etag).toBe(computeSessionEtag({ protocol: fullResponse.protocol, context: fullResponse.context, tasks: fullResponse.tasks }));
    expect(fullResponse.snapshot_hash).toBe(fullResponse.etag);
    expect(sessionStore.get("sess-new0001", new Date("2026-04-23T12:00:00Z"))).toEqual({
      agentName: "agent-claude-code",
      lastSeenAt: "2026-04-23T12:00:00.000Z",
      etag: fullResponse.etag,
    });
  });

  test("reuses a valid session token and refreshes lastSeenAt", async () => {
    const issuedTokens = ["sess-reuse0001", "sess-reuse0002"];
    const sessionStore = new SessionStore({ tokenFactory: () => issuedTokens.shift() ?? "sess-fallback" });

    await readAgentSession({ agent: "agent-claude-code" }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      sessionStore,
      workspaceIdReader: () => null,
      now: () => new Date("2026-04-23T12:00:00Z"),
    });

    const response = await readAgentSession({
      agent: "agent-claude-code",
      sessionToken: "sess-reuse0001",
    }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      sessionStore,
      workspaceIdReader: () => null,
      now: () => new Date("2026-04-23T12:10:00Z"),
    });
    const fullResponse = expectFullResponse(response);

    expect(fullResponse.sessionToken).toBe("sess-reuse0001");
    expect(sessionStore.get("sess-reuse0001", new Date("2026-04-23T12:10:00Z"))).toEqual({
      agentName: "agent-claude-code",
      lastSeenAt: "2026-04-23T12:10:00.000Z",
      etag: fullResponse.etag,
    });
  });

  test("returns changed false when the provided session etag still matches", async () => {
    const sessionStore = new SessionStore({ tokenFactory: () => "sess-match0001" });

    const initialResponse = await readAgentSession({ agent: "agent-claude-code" }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      sessionStore,
      workspaceIdReader: () => null,
      now: () => new Date("2026-04-23T12:00:00Z"),
    });

    const response = await readAgentSession({
      agent: "agent-claude-code",
      sessionToken: initialResponse.sessionToken,
      since: initialResponse.etag,
    }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      sessionStore,
      workspaceIdReader: () => null,
      now: () => new Date("2026-04-23T12:05:00Z"),
    });

    expect(response).toEqual(expect.objectContaining({
      changed: false,
      sessionToken: "sess-match0001",
      etag: initialResponse.etag,
      snapshot_hash: initialResponse.etag,
    }));
  });

  test("returns a full response when the vault snapshot changes", async () => {
    const sessionStore = new SessionStore({ tokenFactory: () => "sess-diff0001" });
    const firstReadModel = createReadModel();
    const secondReadModel = {
      ...createReadModel(),
      tasks: [createTask("task-1"), createTask("task-2", { title: "Task task-2" })],
    } satisfies VaultReadModel;

    const initialResponse = await readAgentSession({ agent: "agent-claude-code" }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => firstReadModel,
      sessionStore,
      workspaceIdReader: () => null,
      now: () => new Date("2026-04-23T12:00:00Z"),
    });

    const response = await readAgentSession({
      agent: "agent-claude-code",
      sessionToken: initialResponse.sessionToken,
      since: initialResponse.etag,
    }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => secondReadModel,
      sessionStore,
      workspaceIdReader: () => null,
      now: () => new Date("2026-04-23T12:02:00Z"),
    });
    const fullResponse = expectFullResponse(response);

    expect(fullResponse.sessionToken).toBe("sess-diff0001");
    expect(fullResponse.etag).not.toBe(initialResponse.etag);
    expect(fullResponse.tasks).toHaveLength(2);
  });

  test("includes the workspace brief in the protocol section", async () => {
    const sessionStore = new SessionStore({ tokenFactory: () => "sess-protocol0001" });

    const response = await readAgentSession({ agent: "agent-claude-code" }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => ({
        ...createReadModel(),
        workspaces: [{
          id: "ws-demo",
          type: "workspace",
          name: "Demo",
          ownerIds: [],
          memberIds: [],
          projectIds: [],
          boardIds: [],
          columnIds: [],
          taskIds: [],
          approvalIds: [],
          createdAt: "2026",
          updatedAt: "2026",
          body: "# Workspace Brief\n\nVerified workspace guidance.",
          sourcePath: "vault/shared/workspaces/ws-demo.md",
        }],
      }),
      sessionStore,
      workspaceIdReader: () => null,
    });
    const fullResponse = expectFullResponse(response);

    expect(fullResponse.protocol).toEqual({
      workspaceBrief: "# Workspace Brief\n\nVerified workspace guidance.",
      warning: null,
    });
  });

  test("includes a warning when the workspace brief is empty", async () => {
    const sessionStore = new SessionStore({ tokenFactory: () => "sess-emptybrief0001" });

    const response = await readAgentSession({ agent: "agent-claude-code" }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      sessionStore,
      workspaceIdReader: () => null,
    });
    const fullResponse = expectFullResponse(response);

    expect(fullResponse.protocol).toEqual({
      workspaceBrief: null,
      warning: "Workspace brief is empty.",
    });
  });

  test("omits the protocol section when includeProtocol is false", async () => {
    const sessionStore = new SessionStore({ tokenFactory: () => "sess-noprotocol0001" });

    const response = await readAgentSession({ agent: "agent-claude-code", includeProtocol: false }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      sessionStore,
      workspaceIdReader: () => null,
    });
    const fullResponse = expectFullResponse(response);

    expect(fullResponse.protocol).toBeNull();
  });

  test("issues a new token and returns a full response when the provided session token has expired", async () => {
    const issuedTokens = ["sess-expire0001", "sess-expire0002"];
    const sessionStore = new SessionStore({ tokenFactory: () => issuedTokens.shift() ?? "sess-fallback" });

    const initialResponse = await readAgentSession({ agent: "agent-claude-code" }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      sessionStore,
      workspaceIdReader: () => null,
      now: () => new Date("2026-04-23T12:00:00Z"),
    });

    const response = await readAgentSession({
      agent: "agent-claude-code",
      sessionToken: "sess-expire0001",
      since: initialResponse.etag,
    }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      sessionStore,
      workspaceIdReader: () => null,
      now: () => new Date("2026-04-23T12:31:00Z"),
    });
    const fullResponse = expectFullResponse(response);

    expect(fullResponse.sessionToken).toBe("sess-expire0002");
    expect(sessionStore.get("sess-expire0001", new Date("2026-04-23T12:31:00Z"))).toBeNull();
    expect(sessionStore.get("sess-expire0002", new Date("2026-04-23T12:31:00Z"))).toEqual({
      agentName: "agent-claude-code",
      lastSeenAt: "2026-04-23T12:31:00.000Z",
      etag: fullResponse.etag,
    });
  });

  test("auto-registers a missing agent on first session start", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-session-auto-agent-"));
    const sessionStore = new SessionStore({ tokenFactory: () => "sess-auto0001" });

    try {
      await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
      await writeFile(join(root, "vault", "shared", "workspaces", "ws-demo.md"), [
        "---",
        'id: "ws-demo"',
        'type: "workspace"',
        'name: "Demo Workspace"',
        'owner_ids: ["@owner"]',
        'member_ids: ["@owner"]',
        'created_at: "2026-04-23T12:00:00Z"',
        'updated_at: "2026-04-23T12:00:00Z"',
        "---",
        "",
      ].join("\n"), "utf8");

      await readAgentSession({ agent: "agent-claude-code" }, {
        resolveRoot: () => root,
        sessionStore,
        workspaceIdReader: () => null,
        now: () => new Date("2026-04-23T12:00:00Z"),
        env: { ...process.env, USER: "Relay Tester", CLAUDE_CODE_SESSION: "session-1" },
      });

      await expect(readFile(join(root, "vault", "shared", "agents", "agent-claude-code.md"), "utf8")).resolves.toContain("portrait:");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
