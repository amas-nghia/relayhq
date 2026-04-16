import { defineEventHandler } from "h3";

import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export default defineEventHandler(async () => {
  const vaultRoot = resolveVaultWorkspaceRoot();
  return await readCanonicalVaultReadModel(vaultRoot);
});
