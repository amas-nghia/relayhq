import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { join } from "node:path";

import type { DocStatus, DocType } from "../../../../shared/vault/schema";
import { syncDocDocument, VaultSchemaError } from "../../../services/vault/doc-write";
import { resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function updateVaultDoc(docId: string, body: unknown, options: { vaultRoot?: string; now?: Date } = {}) {
  if (!docId) {
    throw createError({ statusCode: 400, statusMessage: "Doc id is required." });
  }
  if (!isPlainRecord(body)) {
    throw createError({ statusCode: 400, statusMessage: "Request body must be an object." });
  }

  const patch = isPlainRecord(body.patch) ? body.patch : body;
  const tags = patch.tags === undefined
    ? undefined
    : Array.isArray(patch.tags) && patch.tags.every((entry) => typeof entry === "string")
      ? [...new Set((patch.tags as string[]).map((entry) => entry.trim()).filter((entry) => entry.length > 0))].sort((left, right) => left.localeCompare(right))
      : (() => { throw createError({ statusCode: 400, statusMessage: "tags must be a string array when provided." }); })();

  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const filePath = join(resolveSharedVaultPath(vaultRoot), "docs", `${docId}.md`);

  try {
    const result = await syncDocDocument({
      filePath,
      patch: {
        ...(typeof patch.title === "string" ? { title: patch.title.trim() } : {}),
        ...(typeof patch.doc_type === "string" ? { doc_type: patch.doc_type as DocType } : {}),
        ...(typeof patch.status === "string" ? { status: patch.status as DocStatus } : {}),
        ...(patch.project_id === null ? { project_id: null } : typeof patch.project_id === "string" ? { project_id: patch.project_id.trim() } : {}),
        ...(tags === undefined ? {} : { tags }),
      },
      body: typeof patch.body === "string" ? patch.body : undefined,
      now: options.now,
    });

    return {
      success: true,
      data: {
        id: result.frontmatter.id,
        title: result.frontmatter.title,
        doc_type: result.frontmatter.doc_type,
        status: result.frontmatter.status,
        project_id: result.frontmatter.project_id ?? null,
        updated_at: result.frontmatter.updated_at,
        body: result.body,
      },
      error: null,
    };
  } catch (error) {
    if (error instanceof VaultSchemaError) {
      throw createError({ statusCode: 400, statusMessage: error.issues.map((issue) => `${issue.field}: ${issue.message}`).join(", ") });
    }
    throw error;
  }
}

export default defineEventHandler(async (event) => {
  return await updateVaultDoc(getRouterParam(event, "id") ?? "", await readBody(event));
});
