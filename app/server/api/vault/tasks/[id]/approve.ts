import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";
import { approveTaskLifecycle } from "../../../../services/vault/task-lifecycle";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ApproveTaskBody {
  readonly actorId: string;
}

export interface ApproveVaultTaskDependencies {
  readonly approveTaskLifecycle?: typeof approveTaskLifecycle;
  readonly resolveVaultWorkspaceRoot?: typeof resolveVaultWorkspaceRoot;
}

export async function approveVaultTask(
  taskId: string,
  body: unknown,
  dependencies: ApproveVaultTaskDependencies = {},
) {
  const runApproveTaskLifecycle = dependencies.approveTaskLifecycle ?? approveTaskLifecycle;
  const runResolveVaultWorkspaceRoot = dependencies.resolveVaultWorkspaceRoot ?? resolveVaultWorkspaceRoot;

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  if (!isPlainRecord(body) || typeof body.actorId !== "string" || body.actorId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "actorId is required." });
  }

  return await runApproveTaskLifecycle({ taskId, actorId: body.actorId, vaultRoot: runResolveVaultWorkspaceRoot() });
}

export default defineEventHandler(async (event) => {
  assertMethod(event, "POST");

  return await approveVaultTask(getRouterParam(event, "id") ?? "", await readBody(event));
});
