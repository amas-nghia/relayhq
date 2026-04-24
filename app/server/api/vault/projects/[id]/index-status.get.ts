import { createError, defineEventHandler, getRouterParam } from "h3";

import { readCanonicalVaultReadModel } from "../../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";
import { getKiokuStorage } from "../../../../services/kioku/storage";
import { listProjectCodebaseStatuses, readProjectCodeIndexStatus } from "../../../../services/kioku/project-index";

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "id");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Project id is required." });
  }

  const vaultRoot = resolveVaultWorkspaceRoot();
  const model = await readCanonicalVaultReadModel(vaultRoot);
  const project = model.projects.find((entry) => entry.id === projectId);
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: `Project ${projectId} was not found.` });
  }

  const storage = getKiokuStorage();
  return {
    ...readProjectCodeIndexStatus(project, vaultRoot, storage),
    codebases: listProjectCodebaseStatuses(project, vaultRoot, storage),
  };
});
