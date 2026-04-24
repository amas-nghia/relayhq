import { defineEventHandler, getQuery } from "h3";

import { filterVaultReadModelByWorkspaceId } from "../../models/read-model";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";
import { countTokens, computeSaving, recordTokenSaving } from "../../services/metrics/tracker";

export default defineEventHandler(async (event) => {
  const { assignee, agent } = getQuery(event);

  const vaultRoot = resolveVaultWorkspaceRoot();
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const workspaceId = normalizeConfiguredWorkspaceId(readConfiguredWorkspaceId(), readModel.workspaces);
  const filtered = workspaceId === null ? readModel : filterVaultReadModelByWorkspaceId(readModel, workspaceId);

  const tasks = filtered.tasks
    .filter((task) => typeof assignee !== "string" || task.assignee === assignee)
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee,
      column: task.columnId,
      progress: task.progress,
      boardId: task.boardId,
    }));

  const response = { tasks };
  const agentId = String(agent ?? assignee ?? "anonymous");
  const responseTokens = countTokens(response);
  const { baselineTokens, savedTokens } = computeSaving("tasks", responseTokens);
  recordTokenSaving({ timestamp: new Date().toISOString(), agent: agentId, endpoint: "tasks", responseTokens, baselineTokens, savedTokens });
  return response;
});
