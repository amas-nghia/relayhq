import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { buildVaultReadModel } from "../../../../models/read-model";
import { getRelevantDocsForTask } from "../../../../services/authz/relevant-docs";
import { claimTaskLifecycle } from "../../../../services/vault/task-lifecycle";
import { readSharedVaultCollections } from "../../../../services/vault/read";
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

  const result = await claimTaskLifecycle({
    taskId,
    actorId: body.actorId,
    assignee: typeof body.assignee === "string" && body.assignee.trim().length > 0 ? body.assignee : undefined,
  });
  const vaultRoot = resolveVaultWorkspaceRoot();
  const readModel = buildVaultReadModel(await readSharedVaultCollections(vaultRoot));
  const task = readModel.tasks.find((entry) => entry.id === taskId);

  return {
    ...result,
    relevant_docs: task ? getRelevantDocsForTask(readModel, task, { agentId: body.actorId }) : [],
  };
});
