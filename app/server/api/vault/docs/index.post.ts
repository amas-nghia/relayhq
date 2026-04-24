import { createError, defineEventHandler, readBody } from "h3";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import type { DocStatus, DocType, DocVisibility } from "../../../../shared/vault/schema";
import { createDocDocument, VaultSchemaError } from "../../../services/vault/doc-write";
import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { readConfiguredWorkspaceId, resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a string array when provided.` });
  }
  return value as string[];
}

export async function createVaultDoc(body: unknown, options: { vaultRoot?: string; now?: Date } = {}) {
  if (!isPlainRecord(body) || typeof body.title !== "string" || typeof body.doc_type !== "string") {
    throw createError({ statusCode: 400, statusMessage: "title and doc_type are required." });
  }

  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const workspaceId = readConfiguredWorkspaceId() ?? readModel.workspaces[0]?.id;
  if (!workspaceId) {
    throw createError({ statusCode: 422, statusMessage: "No workspace is available for doc creation." });
  }

  try {
    const docId = `doc-${randomUUID().slice(0, 8)}`;
    const result = await createDocDocument(
      join(resolveSharedVaultPath(vaultRoot), "docs", `${docId}.md`),
      {
        id: docId,
        title: body.title,
        docType: body.doc_type as DocType,
        workspaceId,
        projectId: typeof body.project_id === "string" ? body.project_id.trim() : body.project_id === null ? null : undefined,
        status: typeof body.status === "string" ? body.status as DocStatus : undefined,
        visibility: typeof body.visibility === "string" ? body.visibility as DocVisibility : undefined,
        accessRoles: readStringArray(body.access_roles, "access_roles"),
        sensitive: typeof body.sensitive === "boolean" ? body.sensitive : undefined,
        tags: readStringArray(body.tags, "tags"),
        body: typeof body.body === "string" ? body.body : "",
        now: options.now,
      },
    );

    return {
      success: true,
      data: {
        id: result.frontmatter.id,
        title: result.frontmatter.title,
        doc_type: result.frontmatter.doc_type,
        status: result.frontmatter.status,
        visibility: result.frontmatter.visibility,
        access_roles: result.frontmatter.access_roles,
        sensitive: result.frontmatter.sensitive,
        project_id: result.frontmatter.project_id ?? null,
        sourcePath: result.sourcePath,
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
  return await createVaultDoc(await readBody(event));
});
