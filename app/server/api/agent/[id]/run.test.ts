import { describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../../models/read-model";
import { runAgentTask } from "./run.post";

function createReadModel(): VaultReadModel {
  return {
    workspaces: [{ id: "ws-demo", type: "workspace", name: "Demo", ownerIds: [], memberIds: [], projectIds: [], boardIds: [], columnIds: [], taskIds: [], approvalIds: [], createdAt: "2026", updatedAt: "2026", body: "", sourcePath: "vault/shared/workspaces/ws-demo.md" }],
    projects: [],
    boards: [],
    columns: [],
    tasks: [
      {
        id: "task-001",
        type: "task",
        workspaceId: "ws-demo",
        projectId: "project-demo",
        boardId: "board-demo",
        columnId: "todo",
        status: "todo",
        priority: "high",
        title: "Demo task",
        assignee: "claude-code",
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
        approvalState: { status: "not-needed", needed: false, outcome: "pending", requestedBy: null, requestedAt: null, decidedBy: null, decidedAt: null, reason: null },
        body: "",
        sourcePath: "vault/shared/tasks/task-001.md",
      },
    ],
    issues: [],
    docs: [],
    approvals: [],
    auditNotes: [],
    agents: [{
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
      aliases: ["claude"],
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
    }],
  };
}

describe("POST /api/agent/[id]/run", () => {
  test("starts autorun for an assigned task", async () => {
    const response = await runAgentTask("claude-code", {
      taskId: "task-001",
    }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      workspaceIdReader: () => null,
      startTaskAutorun: async () => ({ runnerId: "runner-1", command: "claude:chat" }),
    });

    expect(response).toEqual({
      agentId: "claude-code",
      taskId: "task-001",
      runnerId: "runner-1",
      command: "claude:chat",
    });
  });

  test("rejects tasks assigned to another agent", async () => {
    await expect(runAgentTask("claude-code", { taskId: "task-001" }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => ({ ...createReadModel(), tasks: [{ ...createReadModel().tasks[0], assignee: "other-agent" }] }),
      workspaceIdReader: () => null,
      startTaskAutorun: async () => ({ runnerId: "runner-1", command: "claude:chat" }),
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});
