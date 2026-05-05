import { rm } from "node:fs/promises";
import { basename, join } from "node:path";

import { createError, defineEventHandler, getRouterParam } from "h3";

import { publishRealtimeUpdate } from "../../../services/realtime/bus";
import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

function resolveAgentAvatarPath(vaultRoot: string, spriteAsset: string | null): string | null {
  if (!spriteAsset || !spriteAsset.startsWith('/assets/agents/')) return null
  const cwd = process.cwd()
  const repoRoot = basename(cwd) === 'app' ? join(cwd, '..') : cwd
  return join(repoRoot, 'web', 'public', spriteAsset.replace(/^\//, ''))
}

export async function deleteVaultAgent(agentId: string, options: { vaultRoot?: string } = {}) {
  if (!agentId) {
    throw createError({ statusCode: 400, statusMessage: "Agent id is required." });
  }

  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const readModel = await readCanonicalVaultReadModel(vaultRoot)
  const agent = readModel.agents.find((entry) => entry.id === agentId || entry.aliases.includes(agentId)) ?? null
  if (!agent) {
    throw createError({ statusCode: 404, statusMessage: `Agent ${agentId} was not found.` });
  }

  const filePath = join(resolveSharedVaultPath(vaultRoot), "agents", `${agent.id}.md`);
  const spriteAsset = agent.spriteAsset ?? null
  const sharedSpriteInUse = spriteAsset !== null && readModel.agents.some((entry) => entry.id !== agent.id && entry.spriteAsset === spriteAsset)
  const avatarPath = sharedSpriteInUse ? null : resolveAgentAvatarPath(vaultRoot, spriteAsset)

  try {
    await rm(filePath, { force: false });
  } catch {
    throw createError({ statusCode: 404, statusMessage: `Agent ${agentId} was not found.` });
  }

  if (avatarPath !== null) {
    await rm(avatarPath, { force: true }).catch(() => undefined)
  }

  publishRealtimeUpdate({
    kind: "vault.changed",
    reason: "agent.deleted",
    taskId: null,
    agentId: agent.id,
    source: agent.id,
    timestamp: new Date().toISOString(),
  });

  return { success: true, agentId: agent.id };
}

export default defineEventHandler(async (event) => {
  return await deleteVaultAgent(getRouterParam(event, "id") ?? "");
});
