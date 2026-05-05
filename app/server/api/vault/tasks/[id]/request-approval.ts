import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";
import { requestTaskApprovalLifecycle } from "../../../../services/vault/task-lifecycle";

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

  if (
    !isPlainRecord(body) ||
    typeof body.actorId !== "string" ||
    body.actorId.trim().length === 0 ||
    typeof body.reason !== "string" ||
    body.reason.trim().length === 0
  ) {
    throw createError({ statusCode: 400, statusMessage: "actorId and reason are required." });
  }

  const vaultRoot = resolveVaultWorkspaceRoot();
  return await requestTaskApprovalLifecycle({ taskId, actorId: body.actorId, reason: body.reason, vaultRoot });
});
