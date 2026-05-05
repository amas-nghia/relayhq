import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";
import { rejectTaskLifecycle } from "../../../../services/vault/task-lifecycle";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface RejectTaskBody {
  readonly actorId: string;
  readonly reason: string;
}

export interface RejectVaultTaskDependencies {
  readonly rejectTaskLifecycle?: typeof rejectTaskLifecycle;
  readonly resolveVaultWorkspaceRoot?: typeof resolveVaultWorkspaceRoot;
}

export async function rejectVaultTask(
  taskId: string,
  body: unknown,
  dependencies: RejectVaultTaskDependencies = {},
) {
  const runRejectTaskLifecycle = dependencies.rejectTaskLifecycle ?? rejectTaskLifecycle;
  const runResolveVaultWorkspaceRoot = dependencies.resolveVaultWorkspaceRoot ?? resolveVaultWorkspaceRoot;

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  if (
    !isPlainRecord(body)
    || typeof body.actorId !== "string"
    || body.actorId.trim().length === 0
    || typeof body.reason !== "string"
    || body.reason.trim().length === 0
  ) {
    throw createError({ statusCode: 400, statusMessage: "actorId and reason are required." });
  }

  return await runRejectTaskLifecycle({ taskId, actorId: body.actorId, reason: body.reason, vaultRoot: runResolveVaultWorkspaceRoot() });
}

export default defineEventHandler(async (event) => {
  assertMethod(event, "POST");

  return await rejectVaultTask(getRouterParam(event, "id") ?? "", await readBody(event));
});
