import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { buildVaultReadModel } from "../../../../models/read-model";
import { getRelevantDocsForTask } from "../../../../services/authz/relevant-docs";
import { claimTaskLifecycle } from "../../../../services/vault/task-lifecycle";
import { readSharedVaultCollections } from "../../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ClaimTaskBody {
  readonly actorId: string;
  readonly assignee?: string;
}

export interface ClaimVaultTaskDependencies {
  readonly claimTaskLifecycle?: typeof claimTaskLifecycle;
  readonly resolveVaultWorkspaceRoot?: typeof resolveVaultWorkspaceRoot;
  readonly readSharedVaultCollections?: typeof readSharedVaultCollections;
  readonly buildVaultReadModel?: typeof buildVaultReadModel;
  readonly getRelevantDocsForTask?: typeof getRelevantDocsForTask;
}

export async function claimVaultTask(
  taskId: string,
  body: unknown,
  dependencies: ClaimVaultTaskDependencies = {},
) {
  const runClaimTaskLifecycle = dependencies.claimTaskLifecycle ?? claimTaskLifecycle;
  const runResolveVaultWorkspaceRoot = dependencies.resolveVaultWorkspaceRoot ?? resolveVaultWorkspaceRoot;
  const runReadSharedVaultCollections = dependencies.readSharedVaultCollections ?? readSharedVaultCollections;
  const runBuildVaultReadModel = dependencies.buildVaultReadModel ?? buildVaultReadModel;
  const runGetRelevantDocsForTask = dependencies.getRelevantDocsForTask ?? getRelevantDocsForTask;

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  if (!isPlainRecord(body) || typeof body.actorId !== "string" || body.actorId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "actorId is required." });
  }

  const vaultRoot = runResolveVaultWorkspaceRoot();
  const readModel = runBuildVaultReadModel(await runReadSharedVaultCollections(vaultRoot));
  const task = readModel.tasks.find((entry) => entry.id === taskId);

  const result = await runClaimTaskLifecycle({
    taskId,
    actorId: body.actorId,
    assignee: typeof body.assignee === "string" && body.assignee.trim().length > 0 ? body.assignee : undefined,
    vaultRoot,
  });

  return {
    ...result,
    relevant_docs: task ? runGetRelevantDocsForTask(readModel, task, { agentId: body.actorId }) : [],
  };
}

export default defineEventHandler(async (event) => {
  assertMethod(event, "POST");

  return await claimVaultTask(getRouterParam(event, "id") ?? "", await readBody(event));
});
