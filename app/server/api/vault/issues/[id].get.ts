import { createError, defineEventHandler, getRouterParam } from "h3";

import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { parseIssueComments, readIssueSection } from "../../../services/vault/issue-comments";
import { resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

export async function readVaultIssue(issueId: string) {
  if (!issueId) {
    throw createError({ statusCode: 400, statusMessage: "Issue id is required." });
  }

  const model = await readCanonicalVaultReadModel(resolveVaultWorkspaceRoot());
  const issue = (model.issues ?? []).find((entry) => entry.id === issueId);
  if (!issue) {
    throw createError({ statusCode: 404, statusMessage: `Issue ${issueId} was not found.` });
  }

  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    reportedBy: issue.reportedBy,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    projectId: issue.projectId,
    problem: readIssueSection(issue.body, "Problem"),
    context: readIssueSection(issue.body, "Context"),
    comments: parseIssueComments(issue.body),
    linkedTaskIds: issue.linkedTaskIds,
    tags: issue.tags,
  };
}

export default defineEventHandler(async (event) => {
  return await readVaultIssue(getRouterParam(event, "id") || "");
});
