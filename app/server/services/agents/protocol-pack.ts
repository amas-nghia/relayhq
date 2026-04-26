import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type RelayHQRuntime = "claude-code" | "cursor" | "antigravity" | "opencode" | "codex";

export interface ProtocolPackOptions {
  readonly baseUrl: string;
  readonly vaultRoot: string;
  readonly agentId: string;
  readonly cwd: string;
}

export interface ProtocolPackTarget {
  readonly runtime: RelayHQRuntime;
  readonly path: string;
  readonly append: boolean;
}

export interface ProtocolPackResult {
  readonly runtime: RelayHQRuntime;
  readonly path: string;
  readonly content: string;
  readonly appended: boolean;
}

export const PROTOCOL_PACK_TARGETS: Record<RelayHQRuntime, ProtocolPackTarget> = {
  "claude-code": { runtime: "claude-code", path: "CLAUDE.md", append: true },
  cursor: { runtime: "cursor", path: ".cursor/rules/relayhq.mdc", append: false },
  antigravity: { runtime: "antigravity", path: ".antigravity/instructions/relayhq.md", append: false },
  opencode: { runtime: "opencode", path: ".opencode/agents/relayhq.md", append: false },
  codex: { runtime: "codex", path: ".codex/instructions/relayhq.md", append: false },
};

function requireRuntime(runtime: string): RelayHQRuntime {
  if (runtime in PROTOCOL_PACK_TARGETS) {
    return runtime as RelayHQRuntime;
  }

  throw new Error(`Unknown runtime: ${runtime}`);
}

export function buildProtocolPack(runtime: string, options: ProtocolPackOptions): string {
  const normalizedRuntime = requireRuntime(runtime);
  const agentId = options.agentId.trim().length > 0 ? options.agentId.trim() : normalizedRuntime;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const vaultRoot = options.vaultRoot.trim();

  return [
    "## RelayHQ - Agent Protocol",
    "",
    `RelayHQ runs at ${baseUrl}.`,
    `Vault root: ${vaultRoot}`,
    `Agent id: ${agentId}`,
    "",
    `At session start, call GET ${baseUrl}/api/agent/state?agentId=${encodeURIComponent(agentId)}.`,
    "",
    "5 operations:",
    `1. Claim task: POST ${baseUrl}/api/vault/tasks/{taskId}/claim with {\"actorId\":\"${agentId}\"}`,
    `2. Heartbeat: POST ${baseUrl}/api/vault/tasks/{taskId}/heartbeat with {\"actorId\":\"${agentId}\"}`,
    `3. Update: PATCH ${baseUrl}/api/vault/tasks/{taskId} with {\"actorId\":\"${agentId}\",\"patch\":{\"progress\":X,\"execution_notes\":\"...\"}}`,
    `4. Done: PATCH ${baseUrl}/api/vault/tasks/{taskId} with {\"actorId\":\"${agentId}\",\"patch\":{\"status\":\"review\",\"result\":\"...\"}}`,
    `5. Blocked: PATCH ${baseUrl}/api/vault/tasks/{taskId} with {\"actorId\":\"${agentId}\",\"patch\":{\"status\":\"blocked\",\"blocked_reason\":\"...\"}}`,
    "",
    "Protocol flow:",
    "- Read active first; resume if present.",
    "- Otherwise claim inbox tasks in priority order.",
    "- Pool tasks are unassigned and can be claimed.",
    "- Do not read vault files directly.",
    "- Move completed work to review, not done.",
    "",
  ].join("\n");
}

export async function setupProtocolPack(runtime: string, options: ProtocolPackOptions): Promise<ProtocolPackResult> {
  const normalizedRuntime = requireRuntime(runtime);
  const target = PROTOCOL_PACK_TARGETS[normalizedRuntime];
  const filePath = join(options.cwd, target.path);
  const marker = "## RelayHQ - Agent Protocol";
  const content = buildProtocolPack(normalizedRuntime, options);

  await mkdir(dirname(filePath), { recursive: true });

  try {
    const existing = await readFile(filePath, "utf8");
    if (existing.includes(marker)) {
      return { runtime: normalizedRuntime, path: filePath, content: existing, appended: false };
    }

    const next = target.append ? `${existing.trimEnd()}\n\n${content}` : `${existing.trimEnd()}\n\n${content}`;
    await writeFile(filePath, next, "utf8");
    return { runtime: normalizedRuntime, path: filePath, content: next, appended: true };
  } catch {
    await writeFile(filePath, content, "utf8");
    return { runtime: normalizedRuntime, path: filePath, content, appended: true };
  }
}
