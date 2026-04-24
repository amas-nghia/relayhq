import { defineEventHandler } from "h3";

import { filterVaultReadModelByWorkspaceId } from "../../models/read-model";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export default defineEventHandler(async () => {
  const vaultRoot = resolveVaultWorkspaceRoot();
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const workspaceId = normalizeConfiguredWorkspaceId(readConfiguredWorkspaceId(), readModel.workspaces);
  return workspaceId === null ? readModel : filterVaultReadModelByWorkspaceId(readModel, workspaceId);
});
