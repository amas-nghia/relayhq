import { createError, defineEventHandler, getQuery } from "h3";

import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

export async function listVaultIssues(query: Record<string, unknown>) {
  const projectId = typeof query.projectId === "string" ? query.projectId.trim() : "";
  const status = typeof query.status === "string" ? query.status.trim() : undefined;

  if (projectId.length === 0) {
    throw createError({ statusCode: 422, statusMessage: "projectId is required." });
  }

  const model = await readCanonicalVaultReadModel(resolveVaultWorkspaceRoot());
  const issues = (model.issues ?? [])
    .filter((issue) => issue.projectId === projectId)
    .filter((issue) => status === undefined || status === "all" || issue.status === status)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));

  return {
    issues: issues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      status: issue.status,
      priority: issue.priority,
      reportedBy: issue.reportedBy,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      linkedTaskIds: issue.linkedTaskIds,
      tags: issue.tags,
      projectId: issue.projectId,
    })),
  };
}

export default defineEventHandler(async (event) => {
  return await listVaultIssues(getQuery(event));
});
