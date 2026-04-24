import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { readCanonicalVaultReadModel } from "../../../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../../../services/vault/runtime";
import { getKiokuStorage } from "../../../../../services/kioku/storage";
import { indexProjectCodebase, readProjectCodeIndexStatus } from "../../../../../services/kioku/project-index";

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

  try {
    const storage = getKiokuStorage();
    const body = await readBody(event).catch(() => null);
    const codebaseName = typeof body?.codebaseName === "string" && body.codebaseName.trim().length > 0
      ? body.codebaseName.trim()
      : undefined;
    const result = indexProjectCodebase(project, vaultRoot, storage, codebaseName);
    return {
      indexedFiles: result.indexedFiles,
      resolvedPaths: result.resolvedPaths,
      warnings: result.warnings,
      status: readProjectCodeIndexStatus(project, vaultRoot, storage),
    };
  } catch (error) {
    throw createError({ statusCode: 422, statusMessage: error instanceof Error ? error.message : "Unable to index project." });
  }
});
