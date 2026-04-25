import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { writeAuditNote } from "../../../../services/vault/audit-write";
import { heartbeatTaskLifecycle } from "../../../../services/vault/task-lifecycle";
import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default defineEventHandler(async (event) => {
  assertMethod(event, "POST");

  const taskId = getRouterParam(event, "id");
  const body = await readBody(event);

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  if (!isPlainRecord(body) || typeof body.actorId !== "string" || body.actorId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "actorId is required." });
  }

  const result = await heartbeatTaskLifecycle({ taskId, actorId: body.actorId });
  await writeAuditNote({
    vaultRoot: resolveVaultWorkspaceRoot(),
    taskId,
    source: body.actorId,
    message: `heartbeat from ${body.actorId}`,
  }).catch(() => undefined)
  return result;
});
