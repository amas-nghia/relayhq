import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { CreateAgentInput } from "../vault/agent-create";
import { readCanonicalVaultReadModel } from "../vault/read";
import { resolveVaultWorkspaceRoot } from "../vault/runtime";

export interface DiscoveredAgentTool {
  readonly id: string;
  readonly name: string;
  readonly detected: boolean;
  readonly alreadyRegistered: boolean;
  readonly configPath: string;
}

export interface AgentToolPreset extends CreateAgentInput {
  readonly id: string;
  readonly portrait: string;
  readonly configPath: string;
}

const TOOL_PRESETS = [
  {
    id: "claude-code",
    name: "Claude Code",
    role: "implementation",
    roles: ["implementation"],
    provider: "claude",
    model: "claude-sonnet-4-6",
    capabilities: ["write-code", "run-tests"],
    taskTypesAccepted: ["feature-implementation", "bug-fix", "refactoring"],
    portrait: "mage",
    runtimeKind: "claude-code",
    commandTemplate: "claude -p \"{prompt}\"",
    runMode: "subprocess",
    workingDirectoryStrategy: "project-root",
    supportsResume: true,
    supportsStreaming: true,
    bootstrapStrategy: "instruction-file",
    verificationStatus: "unknown",
    configPath: join(".claude", "settings.json"),
  },
  {
    id: "cursor",
    name: "Cursor",
    role: "implementation",
    roles: ["implementation"],
    provider: "cursor",
    model: "gpt-4o-mini",
    capabilities: ["write-code", "edit-files"],
    taskTypesAccepted: ["feature-implementation", "bug-fix", "refactoring"],
    portrait: "navigator",
    runtimeKind: "cursor",
    runMode: "manual",
    workingDirectoryStrategy: "project-root",
    supportsResume: true,
    supportsStreaming: false,
    bootstrapStrategy: "instruction-file",
    verificationStatus: "unknown",
    configPath: join(".cursor", "mcp.json"),
  },
  {
    id: "copilot",
    name: "Copilot",
    role: "implementation",
    roles: ["implementation"],
    provider: "copilot",
    model: "gpt-4o",
    capabilities: ["write-code", "review-code"],
    taskTypesAccepted: ["feature-implementation", "bug-fix", "documentation"],
    portrait: "pilot",
    configPath: join(".copilot", "mcp-config.json"),
  },
  {
    id: "windsurf",
    name: "Windsurf",
    role: "implementation",
    roles: ["implementation"],
    provider: "codeium",
    model: "gpt-4o-mini",
    capabilities: ["write-code", "multi-file-edit"],
    taskTypesAccepted: ["feature-implementation", "bug-fix", "refactoring"],
    portrait: "wave",
    configPath: join(".codeium", "windsurf", "mcp_config.json"),
  },
  {
    id: "trae",
    name: "Trae",
    role: "implementation",
    roles: ["implementation"],
    provider: "trae",
    model: "gpt-4o-mini",
    capabilities: ["write-code", "run-tests"],
    taskTypesAccepted: ["feature-implementation", "bug-fix", "documentation"],
    portrait: "circuit",
    configPath: join(".config", "Trae", "mcp.json"),
  },
  {
    id: "kiro",
    name: "Kiro",
    role: "implementation",
    roles: ["implementation"],
    provider: "kiro",
    model: "gpt-4o-mini",
    capabilities: ["write-code", "plan-tasks"],
    taskTypesAccepted: ["feature-implementation", "bug-fix", "api-design"],
    portrait: "forge",
    configPath: join(".kiro", "settings", "mcp.json"),
  },
  {
    id: "opencode",
    name: "OpenCode",
    role: "implementation",
    roles: ["implementation"],
    provider: "opencode",
    model: "gpt-4o-mini",
    capabilities: ["write-code", "run-tests", "multi-file-edit"],
    taskTypesAccepted: ["feature-implementation", "bug-fix", "refactoring"],
    portrait: "circuit",
    runtimeKind: "opencode",
    commandTemplate: "opencode run \"{prompt}\"",
    runMode: "subprocess",
    workingDirectoryStrategy: "project-root",
    supportsResume: true,
    supportsStreaming: true,
    bootstrapStrategy: "instruction-file",
    verificationStatus: "unknown",
    configPath: join(".config", "opencode", "opencode.json"),
  },
  {
    id: "codex",
    name: "Codex",
    role: "implementation",
    roles: ["implementation"],
    provider: "codex",
    model: "gpt-4o",
    capabilities: ["write-code", "run-tests", "multi-file-edit"],
    taskTypesAccepted: ["feature-implementation", "bug-fix", "refactoring"],
    portrait: "pilot",
    runtimeKind: "codex",
    commandTemplate: "codex \"{prompt}\"",
    runMode: "subprocess",
    workingDirectoryStrategy: "project-root",
    supportsResume: true,
    supportsStreaming: true,
    bootstrapStrategy: "instruction-file",
    verificationStatus: "unknown",
    configPath: join(".codex", "config.yaml"),
  },
] as const satisfies ReadonlyArray<Omit<AgentToolPreset, "vaultRoot" | "env" | "now">>;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export function getAgentToolPreset(toolId: string, homeDirectory = homedir()): AgentToolPreset | null {
  const preset = TOOL_PRESETS.find((entry) => entry.id === toolId);
  if (preset === undefined) {
    return null;
  }

  return {
    ...preset,
    configPath: join(homeDirectory, preset.configPath),
  };
}

export async function scanAgentTools(options: { vaultRoot?: string; env?: NodeJS.ProcessEnv; homeDirectory?: string } = {}): Promise<ReadonlyArray<DiscoveredAgentTool>> {
  const env = options.env ?? process.env;
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot(undefined, env);
  const homeDirectory = options.homeDirectory ?? homedir();
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const registeredAgentIds = new Set(readModel.agents.map((agent) => agent.id));

  return await Promise.all(TOOL_PRESETS.map(async (preset) => {
    const configPath = join(homeDirectory, preset.configPath);
    return {
      id: preset.id,
      name: preset.name,
      detected: await fileExists(configPath),
      alreadyRegistered: registeredAgentIds.has(preset.id),
      configPath,
    } satisfies DiscoveredAgentTool;
  }));
}
