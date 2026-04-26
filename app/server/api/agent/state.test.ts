import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../models/read-model";
import { readAgentState } from "./state.get";

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
    assignee: "",
    createdBy: "@alice",
    createdAt: "2026-04-23T12:00:00Z",
    updatedAt: "2026-04-23T12:00:00Z",
    heartbeatAt: null,
    executionStartedAt: null,
    executionNotes: null,
    progress: 0,
    history: [],
    nextRunAt: null,
    cronSchedule: null,
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
    tokensUsed: null,
    model: null,
    costUsd: null,
    parentTaskId: null,
    sourceIssueId: null,
    githubIssueId: null,
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
    tasks: [
      createTask("active-1", { status: "in-progress", assignee: "claude-code", lockedBy: "claude-code", executionNotes: "resume from checkpoint" }),
      createTask("inbox-1", { assignee: "cursor-claude", priority: "critical" }),
      createTask("pool-1", { assignee: "", priority: "medium" }),
      createTask("done-1", { status: "done", assignee: "claude-code" }),
    ],
    issues: [],
    docs: [],
    approvals: [],
    auditNotes: [],
    agents: [
      {
        id: "claude-code",
        type: "agent",
        workspaceId: "ws-demo",
        name: "Claude Code",
        accountId: null,
        role: "implementation",
        roles: ["implementation"],
        provider: "claude",
        apiKeyRef: null,
        model: "claude-sonnet-4-6",
        fallbackModels: [],
        monthlyBudgetUsd: null,
        aliases: ["cursor-claude"],
        runCommand: null,
        runMode: "manual",
        capabilities: [],
        taskTypesAccepted: [],
        approvalRequiredFor: [],
        cannotDo: [],
        accessibleBy: [],
        skillFile: "skills/claude-code.md",
        skillFiles: [],
        status: "available",
        createdAt: "2026-04-23T00:00:00Z",
        updatedAt: "2026-04-23T00:00:00Z",
        body: "",
        sourcePath: "vault/shared/agents/claude-code.md",
      },
    ],
  };
}

describe("GET /api/agent/state", () => {
  test("returns compact active, inbox, and pool state with alias matching", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-agent-state-"));
    try {
      await mkdir(join(root, "vault", "shared"), { recursive: true });

      const state = await readAgentState("claude-code", {
        resolveRoot: () => root,
        readModelReader: async () => createReadModel(),
        workspaceIdReader: () => null,
      });

      expect(state.health.vaultOk).toBe(true);
      expect(state.active?.id).toBe("active-1");
      expect(state.active?.resumeHint).toBe("resume from checkpoint");
      expect(state.inbox.map((task) => task.id)).toEqual(["inbox-1"]);
      expect(state.pool.map((task) => task.id)).toEqual(["pool-1"]);
      expect(state.aliases).toEqual(["cursor-claude"]);
      expect(state.inbox[0]?.pooled).toBeUndefined();
      expect(state.pool[0]?.pooled).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("returns vaultOk false when the vault root is missing", async () => {
    const state = await readAgentState("claude-code", {
      resolveRoot: () => join(tmpdir(), "relayhq-agent-state-missing"),
      readModelReader: async () => createReadModel(),
      workspaceIdReader: () => null,
    });

    expect(state.health.vaultOk).toBe(false);
    expect(state.active).toBeNull();
    expect(state.inbox).toEqual([]);
    expect(state.pool).toEqual([]);
  });
});
