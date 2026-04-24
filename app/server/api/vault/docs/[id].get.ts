import { createError, defineEventHandler, getRouterParam } from "h3";

import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

export default defineEventHandler(async (event) => {
  const docId = getRouterParam(event, "id") ?? "";
  const model = await readCanonicalVaultReadModel(resolveVaultWorkspaceRoot());
  const doc = model.docs.find((entry) => entry.id === docId);
  if (!doc) {
    throw createError({ statusCode: 404, statusMessage: `Doc ${docId} was not found.` });
  }
  return {
    success: true,
    data: {
      id: doc.id,
      title: doc.title,
      doc_type: doc.docType,
      status: doc.status,
      visibility: doc.visibility,
      access_roles: doc.accessRoles,
      sensitive: doc.sensitive,
      workspace_id: doc.workspaceId,
      project_id: doc.projectId,
      created_at: doc.createdAt,
      updated_at: doc.updatedAt,
      tags: doc.tags,
      body: doc.body,
      sourcePath: doc.sourcePath,
    },
    error: null,
  };
});
