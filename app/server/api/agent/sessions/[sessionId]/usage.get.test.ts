import { describe, expect, test } from "bun:test";

import { readSessionUsageSummary } from "./usage.get";

describe("GET /api/agent/sessions/[sessionId]/usage", () => {
  test("returns summarized usage for a valid session id", async () => {
    const response = await readSessionUsageSummary("session-usage", {
      resolveRoot: () => "/tmp/relayhq-vault",
      readSessionUsage: async (vaultRoot, sessionId) => ({
        sessionId,
        agentId: "agent-claude-code",
        taskId: "task-123",
        promptTokens: 120,
        completionTokens: 30,
        totalTokens: 150,
        costUsd: 0.0042,
        model: `claude@${vaultRoot}`,
        usageSource: "runtime",
        estimatedRemainingContextTokens: 199850,
        contextWindowTokens: 200000,
        isEstimated: false,
      }),
    });

    expect(response).toEqual({
      sessionId: "session-usage",
      agentId: "agent-claude-code",
      taskId: "task-123",
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
      costUsd: 0.0042,
      model: "claude@/tmp/relayhq-vault",
      usageSource: "runtime",
      estimatedRemainingContextTokens: 199850,
      contextWindowTokens: 200000,
      isEstimated: false,
    });
  });

  test("rejects blank session ids", async () => {
    await expect(readSessionUsageSummary("")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("returns empty usage summary for missing sessions", async () => {
    const response = await readSessionUsageSummary("missing-session", {
      resolveRoot: () => "/tmp/relayhq-vault",
      readSessionUsage: async (_vaultRoot, sessionId) => ({
        sessionId,
        agentId: null,
        taskId: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        costUsd: null,
        model: null,
        usageSource: null,
        estimatedRemainingContextTokens: null,
        contextWindowTokens: null,
        isEstimated: false,
      }),
    });

    expect(response).toEqual({
      sessionId: "missing-session",
      agentId: null,
      taskId: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      costUsd: null,
      model: null,
      usageSource: null,
      estimatedRemainingContextTokens: null,
      contextWindowTokens: null,
      isEstimated: false,
    });
  });
});
