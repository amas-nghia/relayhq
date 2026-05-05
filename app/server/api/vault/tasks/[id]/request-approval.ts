import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";
import { requestTaskApprovalLifecycle } from "../../../../services/vault/task-lifecycle";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface RequestTaskApprovalBody {
  readonly actorId: string;
  readonly reason: string;
}

export interface RequestTaskApprovalDependencies {
  readonly requestTaskApprovalLifecycle?: typeof requestTaskApprovalLifecycle;
  readonly resolveVaultWorkspaceRoot?: typeof resolveVaultWorkspaceRoot;
}

export async function requestVaultTaskApproval(
  taskId: string,
  body: unknown,
  dependencies: RequestTaskApprovalDependencies = {},
) {
  const runRequestTaskApprovalLifecycle = dependencies.requestTaskApprovalLifecycle ?? requestTaskApprovalLifecycle;
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

  return await runRequestTaskApprovalLifecycle({ taskId, actorId: body.actorId, reason: body.reason, vaultRoot: runResolveVaultWorkspaceRoot() });
}

export default defineEventHandler(async (event) => {
  assertMethod(event, "POST");

  return await requestVaultTaskApproval(getRouterParam(event, "id") ?? "", await readBody(event));
});
