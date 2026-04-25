import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { startTaskAutorun } from "../../../services/agents/autorun";
import { patchTaskLifecycle } from "../../../services/vault/task-lifecycle";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default defineEventHandler(async (event) => {
  assertMethod(event, "PATCH");

  const taskId = getRouterParam(event, "id");
  const body = await readBody(event);

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  if (!isPlainRecord(body) || typeof body.actorId !== "string" || body.actorId.trim().length === 0 || !isPlainRecord(body.patch)) {
    throw createError({ statusCode: 400, statusMessage: "actorId and patch are required." });
  }

  const result = await patchTaskLifecycle({
    taskId,
    actorId: body.actorId,
    patch: body.patch,
  });

  if (body.autoRun === true) {
    const runner = await startTaskAutorun(taskId)
    return { ...result, autoRun: { started: true, ...runner } }
  }

  return result
});
