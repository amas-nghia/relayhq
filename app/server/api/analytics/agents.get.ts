import { defineEventHandler } from "h3";

import { readAgentAnalytics } from "../../services/analytics/summary";

export default defineEventHandler(async () => await readAgentAnalytics());
