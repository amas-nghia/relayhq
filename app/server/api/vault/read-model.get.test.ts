import { describe, expect, test } from "bun:test";

import { readVaultReadModel } from "./read-model.get";

function createReadModel() {
  return {
    workspaces: [
      { id: "ws-a", type: "workspace", name: "Workspace A", ownerIds: [], memberIds: [], projectIds: ["project-a"], boardIds: ["board-a"], columnIds: ["todo-a"], taskIds: ["task-a"], approvalIds: ["approval-a"], createdAt: "2026", updatedAt: "2026", body: "", sourcePath: "vault/shared/workspaces/ws-a.md" },
      { id: "ws-b", type: "workspace", name: "Workspace B", ownerIds: [], memberIds: [], projectIds: ["project-b"], boardIds: ["board-b"], columnIds: ["todo-b"], taskIds: ["task-b"], approvalIds: ["approval-b"], createdAt: "2026", updatedAt: "2026", body: "", sourcePath: "vault/shared/workspaces/ws-b.md" },
    ],
    projects: [
      { id: "project-a", type: "project", workspaceId: "ws-a", name: "Project A", coordinatorAgentId: null, boardIds: ["board-a"], columnIds: ["todo-a"], taskIds: ["task-a"], approvalIds: ["approval-a"], codebases: [], createdAt: "2026", updatedAt: "2026", description: null, budget: null, deadline: null, status: null, scene: null, links: [], attachments: [], body: "", sourcePath: "vault/shared/projects/project-a.md" },
      { id: "project-b", type: "project", workspaceId: "ws-b", name: "Project B", coordinatorAgentId: null, boardIds: ["board-b"], columnIds: ["todo-b"], taskIds: ["task-b"], approvalIds: ["approval-b"], codebases: [], createdAt: "2026", updatedAt: "2026", description: null, budget: null, deadline: null, status: null, scene: null, links: [], attachments: [], body: "", sourcePath: "vault/shared/projects/project-b.md" },
    ],
    boards: [
      { id: "board-a", type: "board", workspaceId: "ws-a", projectId: "project-a", name: "Board A", columnIds: ["todo-a"], taskIds: ["task-a"], approvalIds: ["approval-a"], createdAt: "2026", updatedAt: "2026", body: "", sourcePath: "vault/shared/boards/board-a.md" },
      { id: "board-b", type: "board", workspaceId: "ws-b", projectId: "project-b", name: "Board B", columnIds: ["todo-b"], taskIds: ["task-b"], approvalIds: ["approval-b"], createdAt: "2026", updatedAt: "2026", body: "", sourcePath: "vault/shared/boards/board-b.md" },
    ],
    columns: [
      { id: "todo-a", type: "column", workspaceId: "ws-a", projectId: "project-a", boardId: "board-a", name: "Todo", position: 0, taskIds: ["task-a"], createdAt: "2026", updatedAt: "2026", body: "", sourcePath: "vault/shared/columns/todo-a.md" },
      { id: "todo-b", type: "column", workspaceId: "ws-b", projectId: "project-b", boardId: "board-b", name: "Todo", position: 0, taskIds: ["task-b"], createdAt: "2026", updatedAt: "2026", body: "", sourcePath: "vault/shared/columns/todo-b.md" },
    ],
    tasks: [
      { id: "task-a", type: "task", workspaceId: "ws-a", projectId: "project-a", boardId: "board-a", columnId: "todo-a", status: "todo", priority: "high", title: "Task A", assignee: "", createdBy: "@owner", createdAt: "2026", updatedAt: "2026", heartbeatAt: null, executionStartedAt: null, executionNotes: null, progress: 0, history: [], dispatchStatus: null, dispatchReason: null, lastDispatchAttemptAt: null, nextRunAt: null, cronSchedule: null, approvalNeeded: false, approvalRequestedBy: null, approvalReason: null, approvedBy: null, approvedAt: null, approvalOutcome: "pending", blockedReason: null, blockedSince: null, result: null, completedAt: null, tokensUsed: null, model: null, costUsd: null, parentTaskId: null, sourceIssueId: null, githubIssueId: null, dependsOn: [], tags: [], links: [], lockedBy: null, lockedAt: null, lockExpiresAt: null, isStale: false, approvalIds: ["approval-a"], approvalState: { status: "not-needed", needed: false, outcome: "pending", requestedBy: null, requestedAt: null, decidedBy: null, decidedAt: null, reason: null }, body: "", sourcePath: "vault/shared/tasks/task-a.md" },
      { id: "task-b", type: "task", workspaceId: "ws-b", projectId: "project-b", boardId: "board-b", columnId: "todo-b", status: "todo", priority: "medium", title: "Task B", assignee: "", createdBy: "@owner", createdAt: "2026", updatedAt: "2026", heartbeatAt: null, executionStartedAt: null, executionNotes: null, progress: 0, history: [], dispatchStatus: null, dispatchReason: null, lastDispatchAttemptAt: null, nextRunAt: null, cronSchedule: null, approvalNeeded: false, approvalRequestedBy: null, approvalReason: null, approvedBy: null, approvedAt: null, approvalOutcome: "pending", blockedReason: null, blockedSince: null, result: null, completedAt: null, tokensUsed: null, model: null, costUsd: null, parentTaskId: null, sourceIssueId: null, githubIssueId: null, dependsOn: [], tags: [], links: [], lockedBy: null, lockedAt: null, lockExpiresAt: null, isStale: false, approvalIds: ["approval-b"], approvalState: { status: "not-needed", needed: false, outcome: "pending", requestedBy: null, requestedAt: null, decidedBy: null, decidedAt: null, reason: null }, body: "", sourcePath: "vault/shared/tasks/task-b.md" },
    ],
    issues: [],
    approvals: [
      { id: "approval-a", type: "approval", workspaceId: "ws-a", taskId: "task-a", status: "pending", requestedBy: "@owner", requestedAt: "2026", decidedBy: null, decidedAt: null, reason: null, body: "", sourcePath: "vault/shared/approvals/approval-a.md" },
      { id: "approval-b", type: "approval", workspaceId: "ws-b", taskId: "task-b", status: "pending", requestedBy: "@owner", requestedAt: "2026", decidedBy: null, decidedAt: null, reason: null, body: "", sourcePath: "vault/shared/approvals/approval-b.md" },
    ],
    auditNotes: [],
    docs: [
      { id: "doc-a", type: "doc", workspaceId: "ws-a", projectId: "project-a", title: "Doc A", docType: "brief", status: "active", visibility: "workspace", accessRoles: ["all"], sensitive: false, createdAt: "2026", updatedAt: "2026", tags: [], body: "", sourcePath: "vault/shared/docs/doc-a.md" },
      { id: "doc-b", type: "doc", workspaceId: "ws-b", projectId: "project-b", title: "Doc B", docType: "brief", status: "active", visibility: "workspace", accessRoles: ["all"], sensitive: false, createdAt: "2026", updatedAt: "2026", tags: [], body: "", sourcePath: "vault/shared/docs/doc-b.md" },
    ],
    agents: [
      { id: "agent-a", type: "agent", workspaceId: "ws-a", name: "Agent A", accountId: null, role: "implementation", roles: ["implementation"], provider: "anthropic", apiKeyRef: null, portraitAsset: null, spriteAsset: null, model: "claude-sonnet-4-6", fallbackModels: [], monthlyBudgetUsd: null, aliases: [], runtimeKind: null, runCommand: null, commandTemplate: null, runMode: "manual", webhookUrl: null, workingDirectoryStrategy: null, supportsResume: false, supportsStreaming: false, bootstrapStrategy: null, verificationStatus: null, capabilities: [], taskTypesAccepted: [], approvalRequiredFor: [], cannotDo: [], accessibleBy: [], skillFile: "skills/a.md", skillFiles: [], status: "available", projectId: null, createdAt: "2026", updatedAt: "2026", body: "", sourcePath: "vault/shared/agents/agent-a.md" },
      { id: "agent-b", type: "agent", workspaceId: "ws-b", name: "Agent B", accountId: null, role: "implementation", roles: ["implementation"], provider: "openai", apiKeyRef: null, portraitAsset: null, spriteAsset: null, model: "gpt-5.4", fallbackModels: [], monthlyBudgetUsd: null, aliases: [], runtimeKind: null, runCommand: null, commandTemplate: null, runMode: "manual", webhookUrl: null, workingDirectoryStrategy: null, supportsResume: false, supportsStreaming: false, bootstrapStrategy: null, verificationStatus: null, capabilities: [], taskTypesAccepted: [], approvalRequiredFor: [], cannotDo: [], accessibleBy: [], skillFile: "skills/b.md", skillFiles: [], status: "available", projectId: null, createdAt: "2026", updatedAt: "2026", body: "", sourcePath: "vault/shared/agents/agent-b.md" },
    ],
    coordinatorThreads: [],
  };
}

describe("GET /api/vault/read-model", () => {
  test("recovers stopped sessions before reading and returns the full model when no workspace is configured", async () => {
    const calls: string[] = [];
    const readModel = createReadModel();

    const response = await readVaultReadModel({
      vaultRoot: "/tmp/relayhq-vault",
      recoverStoppedSessions: async (vaultRoot) => {
        calls.push(vaultRoot);
      },
      readModelReader: async () => readModel as any,
      workspaceIdReader: () => null,
    });

    expect(calls).toEqual(["/tmp/relayhq-vault"]);
    expect(response).toBe(readModel);
  });

  test("filters the read model to the configured workspace", async () => {
    const response = await readVaultReadModel({
      vaultRoot: "/tmp/relayhq-vault",
      recoverStoppedSessions: async () => {},
      readModelReader: async () => createReadModel() as any,
      workspaceIdReader: () => "ws-b",
    });

    expect(response.workspaces.map((workspace) => workspace.id)).toEqual(["ws-b"]);
    expect(response.projects.map((project) => project.id)).toEqual(["project-b"]);
    expect(response.docs.map((doc) => doc.id)).toEqual(["doc-b"]);
    expect(response.tasks.map((task) => task.id)).toEqual(["task-b"]);
  });
});
