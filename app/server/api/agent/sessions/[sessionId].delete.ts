import { createError, defineEventHandler, getRouterParam } from "h3";

import { agentRunnerManager } from "../../../services/runners/manager";

export default defineEventHandler((event) => {
  const sessionId = getRouterParam(event, "sessionId") ?? "";
  if (sessionId.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "sessionId is required." });
  }

  const success = agentRunnerManager.stopRunner(sessionId);
  if (!success) {
    throw createError({ statusCode: 404, statusMessage: "Session not found or already stopped." });
  }

  return { success: true, sessionId };
});
