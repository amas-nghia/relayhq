import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { join } from "node:path";

import { readIssueDocument, syncIssueDocument } from "../../../services/vault/issue-write";
import { resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

const ISSUE_TRANSITIONS: Readonly<Record<string, ReadonlyArray<string>>> = {
  open: ["investigating", "wont-fix"],
  investigating: ["resolved", "wont-fix"],
  resolved: [],
  "wont-fix": [],
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function replaceSection(body: string, heading: string, value: string | null | undefined): string {
  const normalized = body.trim();
  const sectionPattern = new RegExp(`(?:\\n|^)##\\s+${heading}\\s*\\n[\\s\\S]*?(?=\\n##\\s+|$)`, "i");
  const withoutSection = normalized.replace(sectionPattern, "").trim();
  if (value === undefined) {
    return normalized;
  }
  const parts = [withoutSection];
  if (value !== null) {
    parts.push(`## ${heading}\n${value}`);
  }
  return parts.filter((part) => part.trim().length > 0).join("\n\n").trimEnd() + "\n";
}

export async function patchVaultIssue(issueId: string, body: unknown) {
  if (!issueId) throw createError({ statusCode: 400, statusMessage: "Issue id is required." });
  const patch = isPlainRecord(body) && isPlainRecord(body.patch) ? body.patch : {};
  const actorId = isPlainRecord(body) && typeof body.actorId === "string" ? body.actorId : "@relayhq-web";
  const vaultRoot = resolveVaultWorkspaceRoot();
  const filePath = join(resolveSharedVaultPath(vaultRoot), "issues", `${issueId}.md`);
  const current = await readIssueDocument(filePath);
  const nextStatus = typeof patch.status === "string" ? patch.status : undefined;

  if (nextStatus !== undefined && nextStatus !== current.frontmatter.status) {
    const allowedStatuses = ISSUE_TRANSITIONS[current.frontmatter.status] ?? [];
    if (!allowedStatuses.includes(nextStatus)) {
      throw createError({
        statusCode: 422,
        statusMessage: `Issue ${current.frontmatter.status} cannot transition to ${nextStatus}.`,
      });
    }
  }

  const result = await syncIssueDocument({
    filePath,
    actorId,
    mutate: () => ({
      ...(typeof patch.status === "string" ? { status: patch.status } : {}),
      ...(typeof patch.priority === "string" ? { priority: patch.priority } : {}),
      ...(typeof patch.title === "string" ? { title: patch.title.trim() } : {}),
      ...(Array.isArray(patch.linked_task_ids) ? { linked_task_ids: patch.linked_task_ids.filter((item): item is string => typeof item === "string") } : {}),
      ...(Array.isArray(patch.tags) ? { tags: patch.tags.filter((item): item is string => typeof item === "string") } : {}),
      ...(typeof patch.discovered_during_task_id === "string" || patch.discovered_during_task_id === null ? { discovered_during_task_id: patch.discovered_during_task_id } : {}),
    }),
    mutateBody: (currentBody) => {
      let nextBody = currentBody;
      if (typeof patch.problem === "string" || patch.problem === null) {
        nextBody = replaceSection(nextBody, "Problem", patch.problem);
      }
      if (typeof patch.context === "string" || patch.context === null) {
        nextBody = replaceSection(nextBody, "Context", patch.context);
      }
      return nextBody;
    },
  });
  return {
    issue: {
      id: result.frontmatter.id,
      title: result.frontmatter.title,
      status: result.frontmatter.status,
      priority: result.frontmatter.priority,
      linkedTaskIds: result.frontmatter.linked_task_ids,
      tags: result.frontmatter.tags,
      updatedAt: result.frontmatter.updated_at,
    },
  };
}

export default defineEventHandler(async (event) => {
  return await patchVaultIssue(getRouterParam(event, "id") || "", await readBody(event));
});
