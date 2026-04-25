import { defineEventHandler } from "h3";

import { readWebhookSettings } from "../../services/settings/webhooks";

export default defineEventHandler(async () => await readWebhookSettings());
