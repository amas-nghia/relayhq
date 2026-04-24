import { createError, defineEventHandler, readBody } from "h3";
import { join } from "node:path";

import type { TaskPriority } from "../../../../shared/vault/schema";
import { createIssueDocument } from "../../../services/vault/issue-write";
import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function createVaultIssue(body: unknown) {
  if (!isPlainRecord(body) || typeof body.projectId !== "string" || typeof body.title !== "string") {
    throw createError({ statusCode: 400, statusMessage: "projectId and title are required." });
  }

  const vaultRoot = resolveVaultWorkspaceRoot();
  const model = await readCanonicalVaultReadModel(vaultRoot);
  const project = model.projects.find((entry) => entry.id === body.projectId);
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: `Project ${body.projectId} was not found.` });
  }

  const result = await createIssueDocument(
    join(resolveSharedVaultPath(vaultRoot), "issues", `issue-temp-${Date.now()}.md`),
    {
      workspaceId: project.workspaceId,
      projectId: project.id,
      title: body.title.trim(),
      reportedBy: typeof body.reportedBy === "string" && body.reportedBy.trim().length > 0 ? body.reportedBy.trim() : "@relayhq-web",
      priority: (typeof body.priority === "string" ? body.priority : "medium") as TaskPriority,
      problem: typeof body.problem === "string" ? body.problem : undefined,
      context: typeof body.context === "string" ? body.context : undefined,
      tags: Array.isArray(body.tags) ? body.tags.filter((item): item is string => typeof item === "string") : undefined,
      discoveredDuringTaskId: typeof body.discoveredDuringTaskId === "string" ? body.discoveredDuringTaskId : null,
      linkedTaskIds: Array.isArray(body.linkedTaskIds) ? body.linkedTaskIds.filter((item): item is string => typeof item === "string") : undefined,
    },
  );

  return {
    issue: {
      id: result.frontmatter.id,
      title: result.frontmatter.title,
      status: result.frontmatter.status,
      priority: result.frontmatter.priority,
      reportedBy: result.frontmatter.reported_by,
      projectId: result.frontmatter.project_id,
      createdAt: result.frontmatter.created_at,
      updatedAt: result.frontmatter.updated_at,
    },
  };
}

export default defineEventHandler(async (event) => {
  return await createVaultIssue(await readBody(event));
});
