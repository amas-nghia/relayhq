import { createError, defineEventHandler, getRouterParam } from "h3";

import { readAgentSessionEvents } from "../../../../services/agents/session-events";
import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, "sessionId") ?? ""
  if (sessionId.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "sessionId is required." })
  }

  const vaultRoot = resolveVaultWorkspaceRoot()
  return await readAgentSessionEvents(vaultRoot, sessionId)
})
