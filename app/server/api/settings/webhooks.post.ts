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

  try {
    return await saveWebhookSettings({
      webhooks: body.webhooks.map((entry, index) => {
        if (!isPlainRecord(entry) || typeof entry.url !== "string" || !Array.isArray(entry.events)) {
          throw createError({ statusCode: 400, statusMessage: `webhook ${index + 1} must include url and events.` });
        }

        const events = entry.events.map((value) => {
          if (typeof value !== "string") {
            throw createError({ statusCode: 400, statusMessage: `webhook ${index + 1} contains an invalid event value.` });
          }
          return value;
        });

        return {
          id: typeof entry.id === "string" ? entry.id : undefined,
          url: entry.url,
          events,
          signingSecretRef: typeof entry.signingSecretRef === "string" ? entry.signingSecretRef : null,
        };
      }),
    });
  } catch (error) {
    if (error instanceof Error && "statusCode" in error) {
      throw error;
    }
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : "Invalid webhook settings." });
  }
});
