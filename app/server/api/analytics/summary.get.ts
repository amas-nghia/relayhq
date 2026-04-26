import { defineEventHandler } from "h3";

import { readAnalyticsDashboard } from "../../services/analytics/summary";

export default defineEventHandler(async () => await readAnalyticsDashboard());
