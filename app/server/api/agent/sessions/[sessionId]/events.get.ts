import { createError, defineEventHandler, getRouterParam } from "h3";

import { readAgentSessionEvents } from "../../../../services/agents/session-events";
import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";

interface ReadSessionEventsDependencies {
  readonly resolveRoot?: () => string;
  readonly readSessionEvents?: typeof readAgentSessionEvents;
}

export async function readSessionEvents(
  sessionId: string,
  dependencies: ReadSessionEventsDependencies = {},
) {
  if (sessionId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "sessionId is required." })
  }

  const resolveRoot = dependencies.resolveRoot ?? resolveVaultWorkspaceRoot
  const readEvents = dependencies.readSessionEvents ?? readAgentSessionEvents
  return await readEvents(resolveRoot(), sessionId)
}

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, "sessionId") ?? ""
  return await readSessionEvents(sessionId)
})
