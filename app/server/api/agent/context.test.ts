import { describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../models/read-model";
import { SessionStore } from "../../services/session/store";

import { readAgentContext } from "./context.get";

function createReadModel(): VaultReadModel {
  return {
    workspaces: [
      {
        id: "ws-alpha",
        type: "workspace",
        name: "Alpha Workspace",
        ownerIds: ["@owner"],
        memberIds: ["@owner"],
        projectIds: ["project-alpha"],
        boardIds: ["board-alpha"],
        columnIds: ["column-todo", "column-done"],
        taskIds: ["task-open", "task-done", "task-cancelled"],
        approvalIds: ["approval-pending", "approval-approved"],
        createdAt: "2026-04-19T10:00:00Z",
        updatedAt: "2026-04-19T10:00:00Z",
        body: "workspace body should never leak",
        sourcePath: "vault/shared/workspaces/ws-alpha.md",
      },
    ],
    projects: [
      {
        id: "project-alpha",
        type: "project",
        workspaceId: "ws-alpha",
        name: "Alpha Project",
        codebases: [],
        boardIds: ["board-alpha"],
        columnIds: ["column-todo", "column-done"],
        taskIds: ["task-open", "task-done", "task-cancelled"],
        approvalIds: ["approval-pending", "approval-approved"],
        createdAt: "2026-04-19T10:00:00Z",
        updatedAt: "2026-04-19T10:00:00Z",
        body: "project body should never leak",
        sourcePath: "vault/shared/projects/project-alpha.md",
      },
    ],
    boards: [
      {
        id: "board-alpha",
        type: "board",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        name: "Alpha Board",
        columnIds: ["column-todo", "column-done"],
        taskIds: ["task-open", "task-done", "task-cancelled"],
        approvalIds: ["approval-pending", "approval-approved"],
        createdAt: "2026-04-19T10:00:00Z",
        updatedAt: "2026-04-19T10:00:00Z",
        body: "board body should never leak",
        sourcePath: "vault/shared/boards/board-alpha.md",
      },
    ],
    columns: [
      {
        id: "column-todo",
        type: "column",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        boardId: "board-alpha",
        name: "Todo",
        position: 0,
        taskIds: ["task-open", "task-cancelled"],
        createdAt: "2026-04-19T10:00:00Z",
        updatedAt: "2026-04-19T10:00:00Z",
        body: "column body should never leak",
        sourcePath: "vault/shared/columns/column-todo.md",
      },
      {
        id: "column-done",
        type: "column",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        boardId: "board-alpha",
        name: "Done",
        position: 1,
        taskIds: ["task-done"],
        createdAt: "2026-04-19T10:00:00Z",
        updatedAt: "2026-04-19T10:00:00Z",
        body: "column body should never leak",
        sourcePath: "vault/shared/columns/column-done.md",
      },
    ],
    tasks: [
      {
        id: "task-open",
        type: "task",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        boardId: "board-alpha",
        columnId: "column-todo",
        status: "in-progress",
        priority: "high",
        title: "Implement agent endpoint",
        assignee: "agent-backend-dev",
        createdBy: "@owner",
        createdAt: "2026-04-19T10:00:00Z",
        updatedAt: "2026-04-19T10:00:00Z",
        heartbeatAt: null,
        executionStartedAt: null,
        executionNotes: "internal execution note",
        progress: 60,
        approvalNeeded: true,
        approvalRequestedBy: "@owner",
        approvalReason: "sensitive approval reason",
        approvedBy: null,
        approvedAt: null,
        approvalOutcome: "pending",
        blockedReason: null,
        blockedSince: null,
        result: "private result text",
        completedAt: null,
        parentTaskId: null,
        dependsOn: [],
        tags: ["agent"],
        links: [],
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        isStale: false,
        approvalIds: ["approval-pending"],
        approvalState: {
          status: "pending",
          needed: true,
          outcome: "pending",
          requestedBy: "@owner",
          requestedAt: "2026-04-19T10:05:00Z",
          decidedBy: null,
          decidedAt: null,
          reason: "sensitive approval reason",
        },
        body: "task body should never leak",
        sourcePath: "vault/shared/tasks/task-open.md",
      },
      {
        id: "task-done",
        type: "task",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        boardId: "board-alpha",
        columnId: "column-done",
        status: "done",
        priority: "medium",
        title: "Completed task",
        assignee: "agent-backend-dev",
        createdBy: "@owner",
        createdAt: "2026-04-19T10:00:00Z",
        updatedAt: "2026-04-19T10:00:00Z",
        heartbeatAt: null,
        executionStartedAt: null,
        executionNotes: null,
        progress: 100,
        approvalNeeded: false,
        approvalRequestedBy: null,
        approvalReason: null,
        approvedBy: null,
        approvedAt: null,
        approvalOutcome: "pending",
        blockedReason: null,
        blockedSince: null,
        result: null,
        completedAt: "2026-04-19T10:30:00Z",
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
        body: "done task body should never leak",
        sourcePath: "vault/shared/tasks/task-done.md",
      },
      {
        id: "task-cancelled",
        type: "task",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        boardId: "board-alpha",
        columnId: "column-todo",
        status: "cancelled",
        priority: "low",
        title: "Cancelled task",
        assignee: "agent-backend-dev",
        createdBy: "@owner",
        createdAt: "2026-04-19T10:00:00Z",
        updatedAt: "2026-04-19T10:00:00Z",
        heartbeatAt: null,
        executionStartedAt: null,
        executionNotes: null,
        progress: 0,
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
        body: "cancelled task body should never leak",
        sourcePath: "vault/shared/tasks/task-cancelled.md",
      },
    ],
    approvals: [
      {
        id: "approval-pending",
        type: "approval",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        boardId: "board-alpha",
        taskId: "task-open",
        status: "pending",
        outcome: "pending",
        requestedBy: "@owner",
        requestedAt: "2026-04-19T10:05:00Z",
        decidedBy: null,
        decidedAt: null,
        reason: "never leak approval reason",
        createdAt: "2026-04-19T10:05:00Z",
        updatedAt: "2026-04-19T10:05:00Z",
        body: "approval body should never leak",
        sourcePath: "vault/shared/approvals/approval-pending.md",
      },
      {
        id: "approval-approved",
        type: "approval",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        boardId: "board-alpha",
        taskId: "task-done",
        status: "approved",
        outcome: "approved",
        requestedBy: "@owner",
        requestedAt: "2026-04-19T10:07:00Z",
        decidedBy: "@reviewer",
        decidedAt: "2026-04-19T10:08:00Z",
        reason: "also should not leak",
        createdAt: "2026-04-19T10:07:00Z",
        updatedAt: "2026-04-19T10:08:00Z",
        body: "approval body should never leak",
        sourcePath: "vault/shared/approvals/approval-approved.md",
      },
    ],
    auditNotes: [],
    docs: [],
    agents: [],
  };
}

describe("GET /api/agent/context", () => {
  test("returns a lightweight agent-facing summary without raw read-model leakage", async () => {
    const sessionStore = new SessionStore({ tokenFactory: () => "sess-context" });
    sessionStore.issue("agent-claude-code", new Date("2026-04-19T09:55:00Z"));

    const response = await readAgentContext({
      readModelReader: async () => createReadModel(),
      resolveRoot: () => "/tmp/relayhq-vault",
      sessionStore,
      workspaceIdReader: () => null,
      now: () => new Date("2026-04-19T10:00:00Z"),
    });

    expect(response).toEqual(expect.objectContaining({
      workspaceId: "ws-alpha",
      workspaceName: "Alpha Workspace",
      projects: [
        {
          id: "project-alpha",
          name: "Alpha Project",
          boardCount: 1,
          openIssueCount: 0,
          codebases: [],
        },
      ],
      openTaskCount: 1,
      pendingApprovalCount: 1,
      activeSessions: [
        {
          agentName: "agent-claude-code",
          lastSeenAt: "2026-04-19T09:55:00.000Z",
          idleSeconds: 300,
        },
      ],
      boardSummary: [
        {
          id: "board-alpha",
          name: "Alpha Board",
          columnSummary: [
            {
              id: "column-todo",
              name: "Todo",
              taskCount: 2,
            },
            {
              id: "column-done",
              name: "Done",
              taskCount: 1,
            },
          ],
        },
      ],
    }));

    const payload = JSON.stringify(response);
    expect(payload).not.toContain("task body should never leak");
    expect(payload).not.toContain("internal execution note");
    expect(payload).not.toContain("sensitive approval reason");
    expect(payload).not.toContain("private result text");
    expect(payload).not.toContain("sourcePath");
    expect(payload).not.toContain("body");
  });

  test("returns an empty summary for an empty vault", async () => {
    const response = await readAgentContext({
      readModelReader: async () => ({
        workspaces: [],
        projects: [],
        boards: [],
        columns: [],
        tasks: [],
        approvals: [],
        auditNotes: [],
        docs: [],
        agents: [],
      }),
      resolveRoot: () => "/tmp/relayhq-vault",
      workspaceIdReader: () => null,
    });

    expect(response).toEqual(expect.objectContaining({
      workspaceId: null,
      workspaceName: null,
      projects: [],
      openTaskCount: 0,
      pendingApprovalCount: 0,
      activeSessions: [],
      boardSummary: [],
    }));
  });

  test("includes vaultRoot only when it points outside the default repo root", async () => {
    const previousRoot = process.env.RELAYHQ_VAULT_ROOT;
    process.env.RELAYHQ_VAULT_ROOT = "/external/vault";
    try {
      const response = await readAgentContext({ preloadedReadModel: createReadModel() });
      expect(response.vaultRoot).toBe("/external/vault");
    } finally {
      if (previousRoot === undefined) {
        delete process.env.RELAYHQ_VAULT_ROOT;
      } else {
        process.env.RELAYHQ_VAULT_ROOT = previousRoot;
      }
    }
  });
});
