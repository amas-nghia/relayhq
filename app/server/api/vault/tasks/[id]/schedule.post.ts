import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { scheduleTaskLifecycle } from "../../../../services/vault/task-lifecycle";

interface ScheduleTaskBody {
  readonly actorId: string;
  readonly nextRunAt: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function scheduleVaultTask(taskId: string, body: ScheduleTaskBody): Promise<Awaited<ReturnType<typeof scheduleTaskLifecycle>>> {
  if (taskId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  if (body.actorId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "actorId is required." });
  }

  if (body.nextRunAt.trim().length === 0 || Number.isNaN(Date.parse(body.nextRunAt))) {
    throw createError({ statusCode: 400, statusMessage: "nextRunAt must be an ISO-8601 timestamp." });
  }

  if (Date.parse(body.nextRunAt) <= Date.now()) {
    throw createError({ statusCode: 400, statusMessage: "nextRunAt must be in the future." });
  }

  return await scheduleTaskLifecycle({
    taskId,
    actorId: body.actorId,
    nextRunAt: body.nextRunAt,
  });
}

export default defineEventHandler(async (event) => {
  assertMethod(event, "POST");

  const taskId = getRouterParam(event, "id");
  const body = await readBody(event);

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  if (!isPlainRecord(body) || typeof body.actorId !== "string" || typeof body.nextRunAt !== "string") {
    throw createError({ statusCode: 400, statusMessage: "actorId and nextRunAt are required." });
  }

  return await scheduleVaultTask(taskId, {
    actorId: body.actorId,
    nextRunAt: body.nextRunAt,
  });
});
