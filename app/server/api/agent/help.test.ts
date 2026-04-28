import { describe, expect, test } from "bun:test";

import { readAgentHelp } from "./help.get";

describe("GET /api/agent/help", () => {
  test("returns the machine-readable agent help contract", async () => {
    const response = await readAgentHelp({ baseUrl: "http://127.0.0.1:44210" });

    expect(response.product).toBe("RelayHQ");
    expect(response.mode).toBe("control-plane");
    expect(response.baseUrl).toBe("http://127.0.0.1:44210");
    expect(response.endpoints.some((endpoint) => endpoint.path === "/api/vault/tasks/{taskId}/claim" && endpoint.method === "POST")).toBe(true);
    expect(response.rules.humanOnlyTransitions).toEqual(["review -> done", "review -> todo"]);
    expect(response.taskStatusModel.failureStatus).toEqual(["failed"]);
    expect(response.supportedRuntimes).toEqual([
      { runtime: "opencode", status: "supported" },
      { runtime: "claude-code", status: "experimental" },
      { runtime: "codex", status: "experimental" },
    ]);
    expect(response.runtimeExamples).toEqual([
      {
        runtime: "opencode",
        launch: {
          command: "opencode",
          args: ["run", "<prompt>", "--format", "json", "--dangerously-skip-permissions", "--dir", "<repo-root>"],
          cwdStrategy: "pty-wrapper",
          outputMode: "json",
        },
        notes: [
          "Preferred v0.1 runtime for RelayHQ.",
          "Use a pseudo-TTY wrapper in harnesses if direct stdio pipes do not emit events reliably.",
          "The prompt should use actorId exactly as the assigned agent id for API calls.",
        ],
      },
      {
        runtime: "claude-code",
        launch: {
          command: "claude",
          args: ["-p", "<prompt>", "--output-format", "stream-json", "--allowedTools", "Bash,Write,Read,Edit,Glob,Grep"],
          cwdStrategy: "spawn-cwd",
          outputMode: "stream-json",
        },
        notes: [
          "Experimental in v0.1.",
          "Claude examples must use actorId, not agentId, for RelayHQ API calls.",
          "Use spawn cwd for repo root; Claude does not rely on a --dir flag in this integration.",
        ],
      },
      {
        runtime: "codex",
        launch: {
          command: "codex",
          args: ["<prompt>"],
          cwdStrategy: "spawn-cwd",
          outputMode: "text",
        },
        notes: [
          "Experimental in v0.1.",
          "Add runtime-specific structured output parsing before relying on Codex transcripts in production.",
        ],
      },
    ]);
  });

  test("includes runtime hint when agentId is provided", async () => {
    const response = await readAgentHelp({
      baseUrl: "http://127.0.0.1:44210",
      resolveRoot: () => "/vault",
      readModelReader: async () => ({
        agents: [{
          id: "gpt-4-0-lazape",
          runtimeKind: "opencode",
          runMode: "subprocess",
          runCommand: null,
          commandTemplate: null,
          provider: "openai",
          webhookUrl: null,
        }],
      }) as never,
    }, {
      agentId: "gpt-4-0-lazape",
    });

    expect(response.agentRuntimeHint).toEqual({
      agentId: "gpt-4-0-lazape",
      runtimeKind: "opencode",
      verificationStatus: "ready",
    });
  });
});
