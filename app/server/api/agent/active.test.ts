import { describe, expect, test } from "bun:test";

import { SessionStore } from "../../services/session/store";
import { readActiveAgents } from "./active.get";

describe("GET /api/agent/active", () => {
  test("returns only active sessions and indexes duplicate agent names", () => {
    const issuedTokens = ["sess-a", "sess-b", "sess-c"];
    const sessionStore = new SessionStore({ tokenFactory: () => issuedTokens.shift() ?? "sess-fallback" });

    sessionStore.issue("claude-code", new Date("2026-04-23T12:00:00Z"));
    sessionStore.issue("claude-code", new Date("2026-04-23T12:10:00Z"));
    sessionStore.issue("codex", new Date("2026-04-23T11:20:00Z"));

    const response = readActiveAgents({
      sessionStore,
      now: () => new Date("2026-04-23T12:20:00Z"),
    });

    expect(response).toEqual([
      {
        agentName: "claude-code#1",
        lastSeenAt: "2026-04-23T12:10:00.000Z",
        idleSeconds: 600,
      },
      {
        agentName: "claude-code#2",
        lastSeenAt: "2026-04-23T12:00:00.000Z",
        idleSeconds: 1200,
      },
    ]);
  });
});
