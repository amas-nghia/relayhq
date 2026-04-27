import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { createError, defineEventHandler, getRouterParam } from "h3";

import { publishRealtimeUpdate } from "../../../services/realtime/bus";
import { resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

export async function deleteVaultAgent(agentId: string, options: { vaultRoot?: string } = {}) {
  if (!agentId) {
    throw createError({ statusCode: 400, statusMessage: "Agent id is required." });
  }

  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const filePath = join(resolveSharedVaultPath(vaultRoot), "agents", `${agentId}.md`);

  try {
    await unlink(filePath);
  } catch {
    throw createError({ statusCode: 404, statusMessage: `Agent ${agentId} was not found.` });
  }

  publishRealtimeUpdate({
    kind: "vault.changed",
    reason: "agent.deleted",
    taskId: null,
    agentId,
    source: agentId,
    timestamp: new Date().toISOString(),
  });

  return { success: true, agentId };
}

export default defineEventHandler(async (event) => {
  return await deleteVaultAgent(getRouterParam(event, "id") ?? "");
});
