import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { launchAgentSession } from "../../../services/agents/launch";

export default defineEventHandler(async (event) => {
  const agentId = getRouterParam(event, "id") ?? "";
  const body = await readBody(event);

  if (typeof body?.taskId !== "string" || body.taskId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "taskId is required." });
  }

  return await launchAgentSession({
    agentId,
    taskId: body.taskId.trim(),
    mode: "resume",
    surface: body?.surface === 'visible-terminal' ? 'visible-terminal' : 'background',
    previousSessionId: typeof body?.previousSessionId === "string" ? body.previousSessionId : null,
  });
});
