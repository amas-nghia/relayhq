import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { join } from "node:path";

import { appendIssueComment, parseIssueComments } from "../../../../services/vault/issue-comments";
import { readIssueDocument, syncIssueDocument } from "../../../../services/vault/issue-write";
import { resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function createIssueComment(issueId: string, body: unknown) {
  if (!issueId) {
    throw createError({ statusCode: 400, statusMessage: "Issue id is required." });
  }
  if (!isPlainRecord(body)) {
    throw createError({ statusCode: 400, statusMessage: "Request body must be an object." });
  }

  const actorId = typeof body.actorId === "string" && body.actorId.trim().length > 0 ? body.actorId.trim() : null;
  const commentBody = typeof body.body === "string"
    ? body.body.trim()
    : typeof body.comment === "string"
      ? body.comment.trim()
      : "";

  if (actorId === null || commentBody.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "actorId and body are required." });
  }

  const vaultRoot = resolveVaultWorkspaceRoot();
  const filePath = join(resolveSharedVaultPath(vaultRoot), "issues", `${issueId}.md`);
  await readIssueDocument(filePath);
  const now = new Date();

  const result = await syncIssueDocument({
    filePath,
    actorId,
    now,
    mutate: () => ({}),
    mutateBody: (currentBody) => appendIssueComment(currentBody, {
      author: actorId,
      timestamp: now.toISOString(),
      body: commentBody,
    }),
  });

  return {
    comment: parseIssueComments(result.body).at(-1) ?? null,
    updatedAt: result.frontmatter.updated_at,
  };
}

export default defineEventHandler(async (event) => {
  return await createIssueComment(getRouterParam(event, "id") || "", await readBody(event));
});
