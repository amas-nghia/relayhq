import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { runAgentTask } from "./run.post";

export async function resumeAgentTask(
  agentId: string,
  body: { taskId?: unknown; surface?: unknown; previousSessionId?: unknown },
  dependencies?: Parameters<typeof runAgentTask>[2],
) {
  if (typeof body?.taskId !== "string" || body.taskId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "taskId is required." });
  }

  return await runAgentTask(agentId, {
    taskId: body.taskId.trim(),
    mode: "resume",
    surface: body?.surface === "visible-terminal" ? "visible-terminal" : "background",
    previousSessionId: typeof body?.previousSessionId === "string" ? body.previousSessionId : null,
  }, dependencies);
}

export default defineEventHandler(async (event) => {
  const agentId = getRouterParam(event, "id") ?? "";
  const body = await readBody(event);
  return await resumeAgentTask(agentId, body ?? {});
});
