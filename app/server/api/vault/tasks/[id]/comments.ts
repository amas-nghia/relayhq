import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { appendTaskComment, readTaskThread } from "../../../../services/vault/task-comments";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, "id");
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  if (event.method === "GET") {
    return {
      data: await readTaskThread(taskId),
      error: null,
    };
  }

  assertMethod(event, "POST");
  const body = await readBody(event);
  if (!isPlainRecord(body) || typeof body.author !== "string" || typeof body.body !== "string") {
    throw createError({ statusCode: 400, statusMessage: "author and body are required." });
  }

  return {
    data: await appendTaskComment(taskId, { author: body.author, body: body.body }),
    error: null,
  };
});
