import { describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../models/read-model";
import { getRelevantDocsForTask } from "./relevant-docs";

function createReadModel(): VaultReadModel {
  return {
    workspaces: [],
    projects: [],
    boards: [],
    columns: [],
    tasks: [{
      id: "task-1",
      type: "task",
      workspaceId: "ws-demo",
      projectId: "project-demo",
      boardId: "board-demo",
      columnId: "todo",
      status: "in-progress",
      priority: "high",
      title: "Ship docs",
      assignee: "agent-claude-code",
      createdBy: "@owner",
      createdAt: "2026-04-24T00:00:00Z",
      updatedAt: "2026-04-24T00:00:00Z",
      heartbeatAt: null,
      executionStartedAt: null,
      executionNotes: null,
      progress: 20,
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
      tags: ["deploy"],
      links: [],
      lockedBy: null,
      lockedAt: null,
      lockExpiresAt: null,
      isStale: false,
      approvalIds: [],
      approvalState: { status: "not-needed", needed: false, outcome: "pending", requestedBy: null, requestedAt: null, decidedBy: null, decidedAt: null, reason: null },
      body: "",
      sourcePath: "vault/shared/tasks/task-1.md",
    }],
    issues: [],
    approvals: [],
    auditNotes: [],
    docs: [
      { id: "doc-brief", type: "doc", docType: "brief", workspaceId: "ws-demo", projectId: "project-demo", title: "Deploy brief", status: "active", visibility: "project", accessRoles: ["all"], sensitive: false, createdAt: "2026", updatedAt: "2026", tags: ["deploy"], body: "Deploy brief content", sourcePath: "vault/shared/docs/doc-brief.md" },
      { id: "doc-plan", type: "doc", docType: "plan", workspaceId: "ws-demo", projectId: "project-demo", title: "Rollout plan", status: "draft", visibility: "project", accessRoles: ["all"], sensitive: false, createdAt: "2026", updatedAt: "2026", tags: [], body: "Plan body", sourcePath: "vault/shared/docs/doc-plan.md" },
    ],
    agents: [],
  };
}

describe("relevant docs selector", () => {
  test("prefers project brief and plan docs for the active task", () => {
    const readModel = createReadModel();
    const docs = getRelevantDocsForTask(readModel, readModel.tasks[0]!, { agentId: "agent-claude-code" });
    expect(docs.map((doc) => doc.id)).toEqual(["doc-brief", "doc-plan"]);
  });
});
