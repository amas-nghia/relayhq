import { describe, expect, test } from "bun:test";

import type { AgentRunnerSummary } from "../../services/runners/manager";
import { SessionStore } from "../../services/session/store";
import { readActiveAgents } from "./active.get";

describe("GET /api/agent/active", () => {
  test("returns runner-backed and attached runtime sessions", () => {
    const issuedTokens = ["sess-a", "sess-b"];
    const sessionStore = new SessionStore({ tokenFactory: () => issuedTokens.shift() ?? "sess-fallback" });
    const runnerSessions: ReadonlyArray<AgentRunnerSummary> = [
      {
        id: "runner-1",
        sessionId: "runner-1",
        agentName: "claude-code",
        taskId: "task-123",
        provider: "anthropic",
        runtimeKind: "claude-code",
        launchSurface: "visible-terminal",
        launchMode: "fresh",
        resumedFromSessionId: null,
        status: "handed-off",
        command: "x-terminal-emulator",
        cwd: "/tmp/work",
        startTime: "2026-04-23T12:15:00.000Z",
        lastEventAt: "2026-04-23T12:19:30.000Z",
      },
    ];

    sessionStore.issue("claude-code", new Date("2026-04-23T12:00:00Z"));
    sessionStore.issue("codex", new Date("2026-04-23T12:10:00Z"));

    const response = readActiveAgents({
      sessionStore,
      runnerReader: () => runnerSessions,
      now: () => new Date("2026-04-23T12:20:00Z"),
    });

    expect(response).toEqual([
      {
        sessionId: "runner-1",
        agentId: "claude-code",
        agentName: "claude-code",
        taskId: "task-123",
        provider: "anthropic",
        runtimeKind: "claude-code",
        launchSurface: "visible-terminal",
        launchMode: "fresh",
        resumedFromSessionId: null,
        status: "handed-off",
        command: "x-terminal-emulator",
        cwd: "/tmp/work",
        startTime: "2026-04-23T12:15:00.000Z",
        lastSeenAt: "2026-04-23T12:19:30.000Z",
        idleSeconds: 30,
        source: "runner",
      },
      {
        sessionId: "sess-b",
        agentId: "codex",
        agentName: "codex",
        lastSeenAt: "2026-04-23T12:10:00.000Z",
        idleSeconds: 600,
        launchSurface: "attached",
        launchMode: "attached",
        status: "attached",
        source: "attached",
      },
      {
        sessionId: "sess-a",
        agentId: "claude-code",
        agentName: "claude-code",
        lastSeenAt: "2026-04-23T12:00:00.000Z",
        idleSeconds: 1200,
        launchSurface: "attached",
        launchMode: "attached",
        status: "attached",
        source: "attached",
      },
    ]);
  });
});
