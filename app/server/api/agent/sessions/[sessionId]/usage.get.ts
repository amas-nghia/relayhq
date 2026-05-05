import { createError, defineEventHandler, getRouterParam } from "h3";

import { readAgentSessionUsage } from "../../../../services/agents/session-events";
import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";

interface ReadSessionUsageDependencies {
  readonly resolveRoot?: () => string;
  readonly readSessionUsage?: typeof readAgentSessionUsage;
}

export async function readSessionUsageSummary(
  sessionId: string,
  dependencies: ReadSessionUsageDependencies = {},
) {
  if (sessionId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "sessionId is required." })
  }

  const resolveRoot = dependencies.resolveRoot ?? resolveVaultWorkspaceRoot
  const readUsage = dependencies.readSessionUsage ?? readAgentSessionUsage
  return await readUsage(resolveRoot(), sessionId)
}

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, "sessionId") ?? ""
  return await readSessionUsageSummary(sessionId)
})
