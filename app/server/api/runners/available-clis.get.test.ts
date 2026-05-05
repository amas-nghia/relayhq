import { describe, expect, test } from "bun:test";

import { listAvailableClis } from "./available-clis.get";

describe("GET /api/runners/available-clis", () => {
  test("returns stable CLI rows with installed flags", () => {
    const response = listAvailableClis((command) => {
      if (String(command).includes("claude")) {
        return Buffer.from("/usr/local/bin/claude\n");
      }
      if (String(command).includes("npx")) {
        return Buffer.from("/usr/bin/npx\n");
      }
      throw new Error("not found");
    });

    expect(response).toContainEqual({
      id: "claude",
      name: "Anthropic Claude CLI",
      command: "claude",
      description: "Official Anthropic CLI for Claude.",
      installed: true,
      path: "/usr/local/bin/claude",
    });
    expect(response).toContainEqual({
      id: "npx",
      name: "NPX (Node)",
      command: "npx",
      description: "Node package executor, useful to run remote agents.",
      installed: true,
      path: "/usr/bin/npx",
    });
    expect(response).toContainEqual({
      id: "opencode",
      name: "OpenCode Runner",
      command: "opencode",
      description: "Open-source code interpreting agent.",
      installed: false,
    });
  });
});
