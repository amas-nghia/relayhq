import { defineEventHandler, getQuery } from "h3";

import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

export default defineEventHandler(async (event) => {
  const projectId = typeof getQuery(event).project_id === "string" ? getQuery(event).project_id?.trim() : undefined;
  const model = await readCanonicalVaultReadModel(resolveVaultWorkspaceRoot());
  const docs = model.docs
    .filter((doc) => projectId === undefined || doc.projectId === projectId)
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      doc_type: doc.docType,
      status: doc.status,
      visibility: doc.visibility,
      access_roles: doc.accessRoles,
      sensitive: doc.sensitive,
      workspace_id: doc.workspaceId,
      project_id: doc.projectId,
      updated_at: doc.updatedAt,
      created_at: doc.createdAt,
      tags: doc.tags,
      sourcePath: doc.sourcePath,
    }));

  return { success: true, data: docs, error: null };
});
