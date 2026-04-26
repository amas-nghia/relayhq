import { createError, defineEventHandler, getQuery } from "h3";

import { buildKiokuGraph } from "../../services/kioku/graph";
import { getKiokuStorage } from "../../services/kioku/storage";

function readThreshold(value: string | string[] | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw createError({ statusCode: 400, statusMessage: "threshold must be a number between 0 and 1." });
  }

  return parsed;
}

export default defineEventHandler((event) => {
  const query = getQuery(event);
  const projectId = typeof query.projectId === "string" && query.projectId.trim().length > 0 ? query.projectId.trim() : undefined;
  const threshold = readThreshold(query.threshold);

  return buildKiokuGraph(getKiokuStorage(), { projectId, threshold });
});
