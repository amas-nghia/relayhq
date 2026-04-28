import { execSync } from "node:child_process";

import type { ReadModelAgent } from "../../models/read-model";

export interface AgentRuntimeReadiness {
  readonly agentId: string;
  readonly runtimeKind: string | null;
  readonly launchMode: string | null;
  readonly verificationStatus: 'unknown' | 'ready' | 'failed';
  readonly installed: boolean;
  readonly command: string | null;
  readonly path: string | null;
  readonly reason: string | null;
}

function firstCommandToken(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.split(/\s+/)[0]?.replace(/^['"]|['"]$/g, "") ?? null;
}

function runtimeCommand(agent: Pick<ReadModelAgent, 'runtimeKind' | 'runCommand' | 'commandTemplate' | 'provider'>): string | null {
  const fromRunCommand = firstCommandToken(agent.runCommand);
  if (fromRunCommand) return fromRunCommand;

  const fromTemplate = firstCommandToken(agent.commandTemplate);
  if (fromTemplate) return fromTemplate;

  if (agent.runtimeKind === "claude-code") return "claude";
  if (agent.runtimeKind === "opencode") return "opencode";
  if (agent.runtimeKind === "codex") return "codex";
  if (agent.provider === "claude") return "claude";
  if (agent.provider === "opencode") return "opencode";
  return null;
}

export function readAgentRuntimeReadiness(agent: ReadModelAgent, commandResolver: (command: string) => string = (command) => execSync(`command -v ${command}`, { stdio: "pipe" }).toString().trim()): AgentRuntimeReadiness {
  if (agent.runMode === "manual") {
    return {
      agentId: agent.id,
      runtimeKind: agent.runtimeKind ?? null,
      launchMode: agent.runMode,
      verificationStatus: "unknown",
      installed: false,
      command: null,
      path: null,
      reason: "Manual runtimes require user launch and cannot be pre-verified.",
    };
  }

  if (agent.runMode === "webhook") {
    return {
      agentId: agent.id,
      runtimeKind: agent.runtimeKind ?? null,
      launchMode: agent.runMode,
      verificationStatus: agent.webhookUrl ? "ready" : "failed",
      installed: Boolean(agent.webhookUrl),
      command: null,
      path: null,
      reason: agent.webhookUrl ? null : "Webhook URL is missing.",
    };
  }

  const command = runtimeCommand(agent);
  if (command === null) {
    return {
      agentId: agent.id,
      runtimeKind: agent.runtimeKind ?? null,
      launchMode: agent.runMode ?? null,
      verificationStatus: "failed",
      installed: false,
      command: null,
      path: null,
      reason: "No launch command could be resolved from the agent runtime profile.",
    };
  }

  try {
    const resolvedPath = commandResolver(command);
    return {
      agentId: agent.id,
      runtimeKind: agent.runtimeKind ?? null,
      launchMode: agent.runMode ?? null,
      verificationStatus: resolvedPath.length > 0 ? "ready" : "failed",
      installed: resolvedPath.length > 0,
      command,
      path: resolvedPath.length > 0 ? resolvedPath : null,
      reason: resolvedPath.length > 0 ? null : `${command} was not found on PATH.`,
    };
  } catch {
    return {
      agentId: agent.id,
      runtimeKind: agent.runtimeKind ?? null,
      launchMode: agent.runMode ?? null,
      verificationStatus: "failed",
      installed: false,
      command,
      path: null,
      reason: `${command} was not found on PATH.`,
    };
  }
}
