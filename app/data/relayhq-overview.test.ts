import { describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../server/models/read-model";
import { selectBoardSummary, selectPendingApprovals } from "./relayhq-overview";

function createReadModel(): VaultReadModel {
  return {
    workspaces: [],
    projects: [],
    boards: [],
    columns: [],
    tasks: [
      {
        id: "task-001",
        type: "task",
        workspaceId: "ws-1",
        projectId: "project-1",
        boardId: "board-1",
        columnId: "review",
        status: "waiting-approval",
        priority: "high",
        title: "Review release plan",
        assignee: "agent-planner",
        createdBy: "@alice",
        createdAt: "2026-04-15T10:00:00Z",
        updatedAt: "2026-04-15T10:30:00Z",
        heartbeatAt: null,
        executionStartedAt: null,
        executionNotes: null,
        progress: 40,
        approvalNeeded: true,
        approvalRequestedBy: "@alice",
        approvalReason: "Need sign-off",
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
        isStale: true,
        approvalIds: ["approval-001"],
        approvalState: {
          status: "pending",
          needed: true,
          outcome: "pending",
          requestedBy: "@alice",
          requestedAt: "2026-04-15T10:15:00Z",
          decidedBy: null,
          decidedAt: null,
          reason: "Need sign-off",
        },
        body: "",
        sourcePath: "vault/shared/tasks/task-001.md",
      },
    ],
    approvals: [
      {
        id: "approval-001",
        type: "approval",
        workspaceId: "ws-1",
        projectId: "project-1",
        boardId: "board-1",
        taskId: "task-001",
        status: "requested",
        outcome: "pending",
        requestedBy: "@alice",
        requestedAt: "2026-04-15T10:15:00Z",
        decidedBy: null,
        decidedAt: null,
        reason: "Need sign-off",
        createdAt: "2026-04-15T10:15:00Z",
        updatedAt: "2026-04-15T10:15:00Z",
        body: "",
        sourcePath: "vault/shared/approvals/approval-001.md",
      },
      {
        id: "approval-002",
        type: "approval",
        workspaceId: "ws-1",
        projectId: "project-1",
        boardId: "board-1",
        taskId: "task-001",
        status: "recorded",
        outcome: "approved",
        requestedBy: "@alice",
        requestedAt: "2026-04-14T10:15:00Z",
        decidedBy: "@bob",
        decidedAt: "2026-04-14T10:20:00Z",
        reason: "Already reviewed",
        createdAt: "2026-04-14T10:15:00Z",
        updatedAt: "2026-04-14T10:20:00Z",
        body: "",
        sourcePath: "vault/shared/approvals/approval-002.md",
      },
    ],
    auditNotes: [],
    agents: [],
  };
}

describe("overview approval selectors", () => {
  test("returns only pending approvals with task metadata", () => {
    const pending = selectPendingApprovals(createReadModel());

    expect(pending).toEqual([
      {
        id: "approval-001",
        taskId: "task-001",
        taskTitle: "Review release plan",
        assignee: "agent-planner",
        reason: "Need sign-off",
        requestedAt: "2026-04-15T10:15:00Z",
        requestedBy: "@alice",
        projectId: "project-1",
        boardId: "board-1",
      },
    ]);
  });

  test("falls back to task approval state when no approval file exists", () => {
    const pending = selectPendingApprovals({
      ...createReadModel(),
      approvals: [],
    });

    expect(pending).toEqual([
      {
        id: "task-task-001",
        taskId: "task-001",
        taskTitle: "Review release plan",
        assignee: "agent-planner",
        reason: "Need sign-off",
        requestedAt: "2026-04-15T10:15:00Z",
        requestedBy: "@alice",
        projectId: "project-1",
        boardId: "board-1",
      },
    ]);
  });

  test("surfaces stale task state on board cards", () => {
    const board = selectBoardSummary(
      {
        ...createReadModel(),
        boards: [
          {
            id: "board-1",
            type: "board",
            workspaceId: "ws-1",
            projectId: "project-1",
            name: "Release board",
            columnIds: ["review"],
            taskIds: ["task-001"],
            approvalIds: ["approval-001"],
            createdAt: "2026-04-15T09:00:00Z",
            updatedAt: "2026-04-15T09:30:00Z",
            body: "",
            sourcePath: "vault/shared/boards/board-1.md",
          },
        ],
        columns: [
          {
            id: "review",
            type: "column",
            workspaceId: "ws-1",
            projectId: "project-1",
            boardId: "board-1",
            name: "Review",
            position: 1,
            taskIds: ["task-001"],
            createdAt: "2026-04-15T09:00:00Z",
            updatedAt: "2026-04-15T09:30:00Z",
            body: "",
            sourcePath: "vault/shared/columns/review.md",
          },
        ],
      },
      "board-1",
    );

    expect(board.columns[0]?.tasks[0]?.isStale).toBe(true);
  });
});
