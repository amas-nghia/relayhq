import { defineEventHandler, getQuery } from "h3";

import { filterDocsForAgent, resolveAgentDocumentAccessContext, writeDeniedDocAccessAudit } from "../../../services/authz/doc-access";
import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

export async function listVaultDocs(query: Record<string, unknown> = {}, options: { vaultRoot?: string; now?: Date } = {}) {
  const projectId = typeof query.project_id === "string" ? query.project_id?.trim() : undefined;
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const model = await readCanonicalVaultReadModel(vaultRoot);
  const accessMine = query.access === "mine";
  const requestedRoles = typeof query.roles === "string" ? query.roles.split(",") : [];
  const filteredByAccess = !accessMine
    ? { allowed: model.docs, denied: [] as typeof model.docs }
    : filterDocsForAgent(model, resolveAgentDocumentAccessContext(model, typeof query.agent_id === "string" ? query.agent_id : null, requestedRoles));

  if (accessMine && typeof query.agent_id === "string" && filteredByAccess.denied.length > 0) {
    await writeDeniedDocAccessAudit({
      vaultRoot,
      agentId: query.agent_id,
      deniedDocIds: filteredByAccess.denied.map((doc) => doc.id),
    });
  }

  const docs = filteredByAccess.allowed
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
}

export default defineEventHandler(async (event) => {
  return await listVaultDocs(getQuery(event));
});
