import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../models/read-model";
import { appendAgentSessionEvent } from "../agents/session-events";
import { clearProviderUsageCache, readProviderUsageAnalytics } from "./provider-usage";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearProviderUsageCache();
});

function createReadModel(): VaultReadModel {
  return {
    workspaces: [],
    projects: [],
    boards: [],
    columns: [],
    issues: [],
    approvals: [],
    auditNotes: [],
    docs: [],
    coordinatorThreads: [],
    tasks: [
      {
        id: "task-1",
        type: "task",
        workspaceId: "ws-1",
        projectId: "project-1",
        boardId: "board-1",
        columnId: "done",
        status: "done",
        priority: "high",
        title: "Task one",
        assignee: "agent-openrouter",
        createdBy: "@owner",
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-03T00:00:00Z",
        heartbeatAt: null,
        executionStartedAt: "2026-04-01T00:00:00Z",
        executionNotes: null,
        progress: 100,
        history: [],
        dispatchStatus: null,
        dispatchReason: null,
        lastDispatchAttemptAt: null,
        approvalNeeded: false,
        approvalRequestedBy: null,
        approvalReason: null,
        approvedBy: null,
        approvedAt: null,
        approvalOutcome: "pending",
        blockedReason: null,
        blockedSince: null,
        result: null,
        completedAt: "2026-04-03T00:00:00Z",
        tokensUsed: 1200,
        model: "openrouter/model-a",
        costUsd: 3.2,
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
        sourcePath: "vault/shared/tasks/task-1.md",
      },
    ],
    agents: [
      {
        id: "agent-openrouter",
        type: "agent",
        workspaceId: "ws-1",
        name: "OpenRouter Agent",
        accountId: null,
        role: "implementation",
        roles: ["implementation"],
        provider: "openrouter",
        apiKeyRef: null,
        portraitAsset: null,
        spriteAsset: null,
        model: "openrouter/model-a",
        fallbackModels: [],
        monthlyBudgetUsd: null,
        aliases: [],
        runtimeKind: "opencode",
        runCommand: null,
        commandTemplate: null,
        runMode: "subprocess",
        webhookUrl: null,
        workingDirectoryStrategy: null,
        supportsResume: true,
        supportsStreaming: true,
        bootstrapStrategy: null,
        verificationStatus: "ready",
        capabilities: [],
        taskTypesAccepted: [],
        approvalRequiredFor: [],
        cannotDo: [],
        accessibleBy: [],
        skillFile: "skills/worker.md",
        skillFiles: [],
        status: "available",
        projectId: null,
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-01T00:00:00Z",
        body: "",
        sourcePath: "vault/shared/agents/agent-openrouter.md",
      },
      {
        id: "agent-anthropic",
        type: "agent",
        workspaceId: "ws-1",
        name: "Anthropic Agent",
        accountId: null,
        role: "implementation",
        roles: ["implementation"],
        provider: "anthropic",
        apiKeyRef: null,
        portraitAsset: null,
        spriteAsset: null,
        model: "claude-sonnet-4-6",
        fallbackModels: [],
        monthlyBudgetUsd: null,
        aliases: [],
        runtimeKind: "claude-code",
        runCommand: null,
        commandTemplate: null,
        runMode: "subprocess",
        webhookUrl: null,
        workingDirectoryStrategy: null,
        supportsResume: true,
        supportsStreaming: true,
        bootstrapStrategy: null,
        verificationStatus: "ready",
        capabilities: [],
        taskTypesAccepted: [],
        approvalRequiredFor: [],
        cannotDo: [],
        accessibleBy: [],
        skillFile: "skills/worker.md",
        skillFiles: [],
        status: "available",
        projectId: null,
        createdAt: "2026-04-01T00:00:00Z",
        updatedAt: "2026-04-01T00:00:00Z",
        body: "",
        sourcePath: "vault/shared/agents/agent-anthropic.md",
      },
    ],
  };
}

describe("provider usage analytics", () => {
  test("aggregates agent usage history and live openrouter quota", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { usage: 12.34, limit: 50, limit_remaining: 37.66 } }), { status: 200 });

    const result = await readProviderUsageAnalytics({
      readModelReader: async () => createReadModel(),
      now: new Date("2026-04-10T00:00:00Z"),
      env: { OPENROUTER_API_KEY: "test-key" },
    });

    expect(result.providers.find((entry) => entry.provider === "openrouter")).toMatchObject({
      availability: "available",
      usedUsd: 12.34,
      remainingUsd: 37.66,
    });
    expect(result.agents.find((entry) => entry.agentId === "agent-openrouter")).toMatchObject({
      recentCostUsd: 3.2,
      recentTokensUsed: 1200,
      recentTaskCount: 1,
    });
  });

  test("prefers recent session event usage when task totals are not populated", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-provider-usage-"))
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({ data: { usage: 12.34, limit: 50, limit_remaining: 37.66 } }), { status: 200 });

      await appendAgentSessionEvent(root, {
        sessionId: "session-usage-1",
        agentId: "agent-openrouter",
        taskId: "task-1",
        type: "session.started",
        timestamp: "2026-04-03T00:00:00Z",
        text: "Launch fresh via opencode: opencode run",
      })
      await appendAgentSessionEvent(root, {
        sessionId: "session-usage-1",
        agentId: "agent-openrouter",
        taskId: "task-1",
        type: "session.usage",
        timestamp: "2026-04-03T00:05:00Z",
        usage: {
          promptTokens: 900,
          completionTokens: 300,
          totalTokens: 1200,
          costUsd: 3.2,
          model: "openrouter/model-a",
          usageSource: "runtime",
        },
      })
      await appendAgentSessionEvent(root, {
        sessionId: "session-usage-1",
        agentId: "agent-openrouter",
        taskId: "task-1",
        type: "session.ended",
        timestamp: "2026-04-03T00:06:00Z",
      })

      const readModel: VaultReadModel = {
        ...createReadModel(),
        tasks: createReadModel().tasks.map((task) => task.id === "task-1"
          ? { ...task, tokensUsed: null, costUsd: null }
          : task),
      }

      const result = await readProviderUsageAnalytics({
        readModelReader: async () => readModel,
        vaultRoot: root,
        now: new Date("2026-04-10T00:00:00Z"),
        env: { OPENROUTER_API_KEY: "test-key" },
      });

      expect(result.agents.find((entry) => entry.agentId === "agent-openrouter")).toMatchObject({
        recentCostUsd: 3.2,
        recentTokensUsed: 1200,
        recentTaskCount: 1,
        byDay: [{ day: "2026-04-03", costUsd: 3.2, tokensUsed: 1200, taskCount: 1 }],
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("marks unsupported providers as unavailable with a reason", async () => {
    const result = await readProviderUsageAnalytics({
      readModelReader: async () => createReadModel(),
      now: new Date("2026-04-10T00:00:00Z"),
      env: {},
    });

    expect(result.providers.find((entry) => entry.provider === "anthropic")).toMatchObject({
      availability: "unavailable",
    });
    expect(result.providers.find((entry) => entry.provider === "openrouter")).toMatchObject({
      availability: "unavailable",
    });
  });
});
