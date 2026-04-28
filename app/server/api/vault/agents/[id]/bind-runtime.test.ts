import { describe, expect, test } from "bun:test";

import { bindAgentRuntime } from "./bind-runtime.post";

describe("POST /api/vault/agents/[id]/bind-runtime", () => {
  test("binds an agent to the OpenCode runtime preset", async () => {
    const calls: Array<Record<string, unknown>> = []
    const response = await bindAgentRuntime("gpt-4-0-lumina", { runtime: "opencode" }, {
      getAgentToolPreset: () => ({
        id: "opencode",
        name: "OpenCode",
        role: "implementation",
        roles: ["implementation"],
        provider: "opencode",
        model: "gpt-4o-mini",
        capabilities: ["write-code"],
        taskTypesAccepted: ["feature-implementation"],
        portrait: "circuit",
        configPath: "/tmp/opencode.json",
        runtimeKind: "opencode",
        commandTemplate: "opencode run \"{prompt}\"",
        runMode: "subprocess",
        workingDirectoryStrategy: "project-root",
        supportsResume: true,
        supportsStreaming: true,
        bootstrapStrategy: "instruction-file",
        verificationStatus: "unknown",
      }),
      patchVaultAgent: async (_agentId, body) => {
        calls.push(body as unknown as Record<string, unknown>)
        return { success: true, agentId: "gpt-4-0-lumina" }
      },
      getAgentInstall: () => ({ runtime: "opencode", filename: ".opencode/agents/relayhq.md", content: "agentId=gpt-4-0-lumina" }),
      getSettingsSnippet: () => ({ snippet: "{}", configFilePath: "/tmp/opencode.json", instruction: "Paste this JSON" }),
    })

    expect(response.success).toBe(true)
    expect(response.agentId).toBe("gpt-4-0-lumina")
    expect(response.runtime).toBe("opencode")
    expect(response.install.filename).toBe(".opencode/agents/relayhq.md")
    expect(response.install.content).toContain("agentId=gpt-4-0-lumina")
    expect(response.settingsSnippet.configFilePath).toContain("opencode")
    expect(calls[0]?.patch).toMatchObject({
      runtime_kind: "opencode",
      run_mode: "subprocess",
      command_template: "opencode run \"{prompt}\"",
      supports_resume: true,
    })
  })

  test("binds an agent to the Claude Code runtime preset", async () => {
    const response = await bindAgentRuntime("claude-code-agent", { runtime: "claude-code" }, {
      getAgentToolPreset: () => ({
        id: "claude-code",
        name: "Claude Code",
        role: "implementation",
        roles: ["implementation"],
        provider: "claude",
        model: "claude-sonnet-4-6",
        capabilities: ["write-code"],
        taskTypesAccepted: ["feature-implementation"],
        portrait: "mage",
        configPath: "/tmp/claude-settings.json",
        runtimeKind: "claude-code",
        commandTemplate: "claude -p \"{prompt}\"",
        runMode: "subprocess",
        workingDirectoryStrategy: "project-root",
        supportsResume: true,
        supportsStreaming: true,
        bootstrapStrategy: "instruction-file",
        verificationStatus: "unknown",
      }),
      patchVaultAgent: async () => ({ success: true, agentId: "claude-code-agent" }),
      getAgentInstall: () => ({ runtime: "claude-code", filename: "CLAUDE.md", content: "agentId=claude-code-agent" }),
      getSettingsSnippet: () => ({ snippet: "{}", configFilePath: "/tmp/claude-settings.json", instruction: "Paste this JSON" }),
    })

    expect(response.runtime).toBe("claude-code")
    expect(response.install.filename).toBe("CLAUDE.md")
    expect(response.install.content).toContain("agentId=claude-code-agent")
  })
})
