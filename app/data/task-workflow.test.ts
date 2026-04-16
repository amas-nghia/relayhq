import { describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../server/models/read-model";
import { defaultTaskWorkflowId, getTaskWorkflow, selectTaskWorkflow } from "./task-workflow";

describe("task workflow records", () => {
  test("returns a deterministic fallback task when live data is unavailable", () => {
    const task = getTaskWorkflow(defaultTaskWorkflowId);

    expect(task.id).toBe("task-002");
    expect(task.approvalState.status).toBe("not-needed");
    expect(task.approvals).toHaveLength(0);
    expect(JSON.stringify(task)).not.toContain("execution_started_at");
    expect(JSON.stringify(task)).not.toContain("heartbeat_at");
    expect(JSON.stringify(task)).not.toContain("executionNotes");
    expect(JSON.stringify(task)).not.toContain("lockedBy");
  });

  test("preserves the requested id when the task is unknown", () => {
    const task = getTaskWorkflow("missing-task-id");

    expect(task.id).toBe("missing-task-id");
  });

  test("keeps the task workflow timeline on the control-plane surface", () => {
    const task = getTaskWorkflow(defaultTaskWorkflowId);

    expect(task.timeline.map((step) => step.detail).join(" ")).not.toContain("execution");
    expect(task.timeline.map((step) => step.detail).join(" ")).not.toContain("heartbeat");
    expect(task.timeline.map((step) => step.detail).join(" ")).not.toContain("lock");
  });

  test("includes shared audit notes without exposing runtime-only detail", () => {
    const model: VaultReadModel = {
      workspaces: [],
      projects: [],
      boards: [],
      columns: [],
      tasks: [
        {
          id: "task-002",
          type: "task",
          workspaceId: "ws-1",
          projectId: "project-1",
          boardId: "board-1",
          columnId: "review",
          status: "waiting-approval",
          priority: "medium",
          title: "Document audit notes",
          assignee: "agent-a",
          createdBy: "@alice",
          createdAt: "2026-04-15T09:00:00Z",
          updatedAt: "2026-04-15T09:30:00Z",
          heartbeatAt: null,
          executionStartedAt: null,
          executionNotes: null,
          progress: 50,
          approvalNeeded: true,
          approvalRequestedBy: "@alice",
          approvalReason: "Need review",
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
            status: "pending",
            needed: true,
            outcome: "pending",
            requestedBy: "@alice",
            requestedAt: "2026-04-15T09:10:00Z",
            decidedBy: null,
            decidedAt: null,
            reason: "Need review",
          },
          body: "",
          sourcePath: "vault/shared/tasks/task-002.md",
        },
      ],
      approvals: [],
      auditNotes: [
        {
          id: "audit-002",
          type: "audit-note",
          taskId: "task-002",
          message: "Human review requested before release.",
          source: "relayhq-ui",
          confidence: 0.92,
          createdAt: "2026-04-15T09:20:00Z",
          sourcePath: "vault/shared/audit/audit-002.md",
        },
      ],
      agents: [],
    };

    const task = selectTaskWorkflow(model, "task-002");

    expect(task.auditNotes).toEqual([
      {
        id: "audit-002",
        message: "Human review requested before release.",
        source: "relayhq-ui",
        confidence: 0.92,
        createdAt: "2026-04-15T09:20:00Z",
      },
    ]);
    expect(JSON.stringify(task.auditNotes)).not.toContain("execution");
    expect(JSON.stringify(task.auditNotes)).not.toContain("heartbeat");
  });
});
