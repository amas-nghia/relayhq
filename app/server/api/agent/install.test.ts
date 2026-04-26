import { describe, expect, test } from "bun:test";

import { getAgentInstall } from "./install.get";

describe("GET /api/agent/install", () => {
  test("returns the protocol pack content and filename", () => {
    const response = getAgentInstall("codex", {
      baseUrl: "http://127.0.0.1:44210",
      vaultRoot: "/tmp/relayhq-vault",
      agentId: "codex",
    });

    expect(response.runtime).toBe("codex");
    expect(response.filename).toBe(".codex/instructions/relayhq.md");
    expect(response.content).toContain("## RelayHQ - Agent Protocol");
  });
});
