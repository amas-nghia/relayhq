import { describe, expect, test } from "bun:test";

import { getSettingsSnippet } from "./snippets.get";

describe("GET /api/settings/snippets", () => {
  test("returns a runtime-specific mcp snippet", () => {
    const response = getSettingsSnippet("claude-code", {
      baseUrl: "http://127.0.0.1:44210",
      vaultRoot: "/tmp/relayhq-vault",
    });

    expect(response.snippet).toContain("mcpServers");
    expect(response.snippet).toContain("RELAYHQ_VAULT_ROOT");
    expect(response.configFilePath).toContain(".claude/settings.json");
  });
});
