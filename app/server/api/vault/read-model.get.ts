import { defineEventHandler } from "h3";

import { filterVaultReadModelByWorkspaceId } from "../../models/read-model";
import { recoverStoppedSessionTasks } from "../../services/agents/session-recovery";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export async function readVaultReadModel(options: {
  vaultRoot?: string;
  recoverStoppedSessions?: typeof recoverStoppedSessionTasks;
  readModelReader?: typeof readCanonicalVaultReadModel;
  workspaceIdReader?: typeof readConfiguredWorkspaceId;
  workspaceIdNormalizer?: typeof normalizeConfiguredWorkspaceId;
} = {}) {
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  await (options.recoverStoppedSessions ?? recoverStoppedSessionTasks)(vaultRoot);
  const readModel = await (options.readModelReader ?? readCanonicalVaultReadModel)(vaultRoot);
  const workspaceId = (options.workspaceIdNormalizer ?? normalizeConfiguredWorkspaceId)(
    (options.workspaceIdReader ?? readConfiguredWorkspaceId)(),
    readModel.workspaces,
  );
  return workspaceId === null ? readModel : filterVaultReadModelByWorkspaceId(readModel, workspaceId);
}

export default defineEventHandler(async () => await readVaultReadModel());
