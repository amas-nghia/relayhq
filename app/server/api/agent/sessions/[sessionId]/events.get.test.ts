import { describe, expect, test } from "bun:test";

import { readSessionEvents } from "./events.get";

describe("GET /api/agent/sessions/[sessionId]/events", () => {
  test("returns recorded events for a valid session id", async () => {
    const response = await readSessionEvents("session-123", {
      resolveRoot: () => "/tmp/relayhq-vault",
      readSessionEvents: async (vaultRoot, sessionId) => ([
        {
          id: `${sessionId}-1`,
          sessionId,
          agentId: "agent-claude-code",
          taskId: "task-123",
          type: "session.started",
          timestamp: "2026-01-01T00:00:00.000Z",
          text: `root=${vaultRoot}`,
        },
      ]),
    });

    expect(response).toEqual([
      expect.objectContaining({
        sessionId: "session-123",
        type: "session.started",
        text: "root=/tmp/relayhq-vault",
      }),
    ]);
  });

  test("rejects blank session ids", async () => {
    await expect(readSessionEvents("   ")).rejects.toMatchObject({ statusCode: 400 });
  });

  test("returns an empty list for missing event logs", async () => {
    const response = await readSessionEvents("missing-session", {
      resolveRoot: () => "/tmp/relayhq-vault",
      readSessionEvents: async () => [],
    });

    expect(response).toEqual([]);
  });
});
