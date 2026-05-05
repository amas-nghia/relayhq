import { defineEventHandler } from "h3";

import { readProviderUsageAnalytics } from "../../services/analytics/provider-usage";

export default defineEventHandler(async () => await readProviderUsageAnalytics());
