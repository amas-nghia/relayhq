import { defineEventHandler } from "h3";

import { readCostAnalytics } from "../../services/analytics/summary";

export default defineEventHandler(async () => await readCostAnalytics());
