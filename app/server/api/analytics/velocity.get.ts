import { defineEventHandler } from "h3";

import { readVelocityAnalytics } from "../../services/analytics/summary";

export default defineEventHandler(async () => await readVelocityAnalytics());
