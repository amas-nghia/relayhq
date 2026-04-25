import { createError, defineEventHandler, readBody } from "h3";

import { sendWebhookTest, type WebhookEvent } from "../../../services/settings/webhooks";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!isPlainRecord(body) || typeof body.url !== "string") {
    throw createError({ statusCode: 400, statusMessage: "url is required." });
  }

  const eventType = (typeof body.event === "string" ? body.event : "task.done") as WebhookEvent;
  await sendWebhookTest(body.url, {
    event: eventType,
    taskId: "task-example",
    title: "Webhook delivery test",
    status: "done",
    assignee: "claude-code",
    timestamp: new Date().toISOString(),
    boardUrl: `${process.env.RELAYHQ_PUBLIC_BASE_URL || "http://127.0.0.1:44211"}/boards/board-demo`,
  });
  return { success: true };
});
