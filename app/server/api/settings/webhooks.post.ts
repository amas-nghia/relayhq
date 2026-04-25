import { createError, defineEventHandler, readBody } from "h3";

import { saveWebhookSettings } from "../../services/settings/webhooks";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!isPlainRecord(body) || !Array.isArray(body.webhooks)) {
    throw createError({ statusCode: 400, statusMessage: "webhooks must be provided as an array." });
  }

  return await saveWebhookSettings({
    webhooks: body.webhooks.flatMap((entry) => {
      if (!isPlainRecord(entry) || typeof entry.url !== "string" || !Array.isArray(entry.events)) {
        return [];
      }
      return [{
        id: typeof entry.id === "string" ? entry.id : undefined,
        url: entry.url,
        events: entry.events.filter((event): event is string => typeof event === "string"),
      }];
    }),
  });
});
