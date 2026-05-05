import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { writeAuditNote } from "../../../../services/vault/audit-write";
import { heartbeatTaskLifecycle } from "../../../../services/vault/task-lifecycle";
import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface HeartbeatTaskBody {
  readonly actorId: string;
}

export interface HeartbeatVaultTaskDependencies {
  readonly heartbeatTaskLifecycle?: typeof heartbeatTaskLifecycle;
  readonly writeAuditNote?: typeof writeAuditNote;
  readonly resolveVaultWorkspaceRoot?: typeof resolveVaultWorkspaceRoot;
}

export async function heartbeatVaultTask(
  taskId: string,
  body: unknown,
  dependencies: HeartbeatVaultTaskDependencies = {},
) {
  const runHeartbeatTaskLifecycle = dependencies.heartbeatTaskLifecycle ?? heartbeatTaskLifecycle;
  const runWriteAuditNote = dependencies.writeAuditNote ?? writeAuditNote;
  const runResolveVaultWorkspaceRoot = dependencies.resolveVaultWorkspaceRoot ?? resolveVaultWorkspaceRoot;

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  if (!isPlainRecord(body) || typeof body.actorId !== "string" || body.actorId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "actorId is required." });
  }

  const result = await runHeartbeatTaskLifecycle({ taskId, actorId: body.actorId });
  await runWriteAuditNote({
    vaultRoot: runResolveVaultWorkspaceRoot(),
    taskId,
    source: body.actorId,
    message: `heartbeat from ${body.actorId}`,
  }).catch(() => undefined);
  return result;
}

export default defineEventHandler(async (event) => {
  assertMethod(event, "POST");

  return await heartbeatVaultTask(getRouterParam(event, "id") ?? "", await readBody(event));
});
