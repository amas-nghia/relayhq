import { createError, defineEventHandler, readBody } from "h3";

import { WEBHOOK_EVENTS, sendWebhookTest, type WebhookEvent } from "../../../services/settings/webhooks";
import { resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface WebhookTestRequest {
  readonly url: string;
  readonly event: WebhookEvent;
  readonly signingSecretRef: string | null;
}

export function parseWebhookTestRequest(body: unknown): WebhookTestRequest {
  if (!isPlainRecord(body) || typeof body.url !== "string") {
    throw createError({ statusCode: 400, statusMessage: "url is required." });
  }

  const eventType = (typeof body.event === "string" ? body.event : "task.done") as WebhookEvent;
  if (!WEBHOOK_EVENTS.includes(eventType)) {
    throw createError({ statusCode: 400, statusMessage: "Unsupported webhook event." });
  }

  return {
    url: body.url,
    event: eventType,
    signingSecretRef: typeof body.signingSecretRef === "string" ? body.signingSecretRef : null,
  };
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const request = parseWebhookTestRequest(body);

  const delivery = await sendWebhookTest({
    id: "webhook-test",
    url: request.url,
    signingSecretRef: request.signingSecretRef,
  }, {
    event: request.event,
    taskId: "task-example",
    title: "Webhook delivery test",
    status: "done",
    assignee: "claude-code",
    timestamp: new Date().toISOString(),
    boardUrl: `${process.env.RELAYHQ_PUBLIC_BASE_URL || "http://127.0.0.1:44211"}/boards/board-demo`,
  }, {
    vaultRoot: resolveVaultWorkspaceRoot(),
  });
  return { success: true, delivery };
});
