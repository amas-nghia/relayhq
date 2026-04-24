import { describe, expect, test } from "bun:test";

import { aggregateTokenSavings } from "./token-savings.get";

describe("GET /api/metrics/token-savings", () => {
  test("aggregates totals, per-agent, per-endpoint, and timeline", () => {
    const result = aggregateTokenSavings([
      { timestamp: "2026-04-19T00:00:00Z", agent: "agent-a", endpoint: "context", responseTokens: 100, baselineTokens: 3000, savedTokens: 2900 },
      { timestamp: "2026-04-19T01:00:00Z", agent: "agent-a", endpoint: "bootstrap", taskId: "task-1", responseTokens: 500, baselineTokens: 6000, savedTokens: 5500 },
      { timestamp: "2026-04-20T00:00:00Z", agent: "agent-b", endpoint: "tasks", responseTokens: 200, baselineTokens: 1890, savedTokens: 1690 },
    ]);
    expect(result.totals.calls).toBe(3);
    expect(result.totals.savedTokens).toBe(10090);
    expect(result.byAgent[0].agent).toBe("agent-a");
    expect(result.byEndpoint.map((entry: any) => entry.endpoint)).toContain("bootstrap");
    expect(result.timeline).toHaveLength(2);
  });
});
