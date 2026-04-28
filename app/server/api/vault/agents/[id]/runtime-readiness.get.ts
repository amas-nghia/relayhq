import { createError, defineEventHandler, getRouterParam } from "h3";

import { readAgentRuntimeReadiness } from "../../../../services/agents/runtime-readiness";
import { readCanonicalVaultReadModel } from "../../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";

export default defineEventHandler(async (event) => {
  const agentId = getRouterParam(event, "id") ?? "";
  if (agentId.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "Agent id is required." });
  }

  const vaultRoot = resolveVaultWorkspaceRoot();
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const agent = readModel.agents.find((entry) => entry.id === agentId);
  if (agent === undefined) {
    throw createError({ statusCode: 404, statusMessage: `Agent ${agentId} was not found.` });
  }

  return readAgentRuntimeReadiness(agent);
});
