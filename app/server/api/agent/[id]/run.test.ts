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
        portraitAsset: null,
        spriteAsset: null,
        model: "claude-sonnet-4-6",
        fallbackModels: [],
        monthlyBudgetUsd: null,
        aliases: ["claude"],
        runtimeKind: "claude-code",
        runCommand: null,
        commandTemplate: "claude -p \"{prompt}\"",
        runMode: "manual",
        webhookUrl: null,
        workingDirectoryStrategy: "project-root",
        supportsResume: true,
        supportsStreaming: true,
        bootstrapStrategy: "instruction-file",
        verificationStatus: "unknown",
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
      launchAgentSession: async () => ({ sessionId: "runner-1", runnerId: "runner-1", agentId: "claude-code", taskId: "task-001", runtimeKind: "claude-code", launchSurface: "background", launchMode: "fresh", command: "claude", args: ["-p"] }),
    });

    expect(response).toEqual({
      agentId: "claude-code",
      taskId: "task-001",
      sessionId: "runner-1",
      runnerId: "runner-1",
      runtimeKind: "claude-code",
      launchSurface: "background",
      launchMode: "fresh",
      command: "claude",
      args: ["-p"],
    });
  });

  test("passes resume launch mode through to the launch service", async () => {
    const response = await runAgentTask("claude-code", {
      taskId: "task-001",
      mode: "resume",
      previousSessionId: "runner-0",
    }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      workspaceIdReader: () => null,
      launchAgentSession: async (request) => ({
        sessionId: request.previousSessionId ?? "runner-2",
        runnerId: "runner-2",
        agentId: request.agentId,
        taskId: request.taskId,
        runtimeKind: "claude-code",
        launchSurface: request.surface ?? "background",
        launchMode: request.mode ?? "fresh",
        command: "claude",
        args: ["-p"],
      }),
    })

    expect(response.launchMode).toBe("resume")
    expect(response.sessionId).toBe("runner-0")
  })

  test("rejects tasks assigned to another agent", async () => {
    await expect(runAgentTask("claude-code", { taskId: "task-001" }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => ({ ...createReadModel(), tasks: [{ ...createReadModel().tasks[0], assignee: "other-agent" }] }),
      workspaceIdReader: () => null,
      launchAgentSession: async () => ({ sessionId: "runner-1", runnerId: "runner-1", agentId: "claude-code", taskId: "task-001", runtimeKind: "claude-code", launchSurface: "background", launchMode: "fresh", command: "claude", args: [] }),
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});
