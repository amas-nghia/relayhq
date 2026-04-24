import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { join } from "node:path";

import { deleteProjectDocuments, readProjectDocument, syncProjectDocument } from "../../../services/vault/project-write";
import { resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

function readOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return value.trim();
  throw createError({ statusCode: 400, statusMessage: "Project patch fields must be strings or null." });
}

function readOptionalCodebases(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: "codebases must be an array when provided." });
  }
  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw createError({ statusCode: 400, statusMessage: `codebases[${index}] must be an object.` });
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== "string" || record.name.trim().length === 0 || typeof record.path !== "string" || record.path.trim().length === 0) {
      throw createError({ statusCode: 400, statusMessage: `codebases[${index}] requires name and path.` });
    }
    return {
      name: record.name.trim(),
      path: record.path.trim(),
      ...(typeof record.tech === "string" && record.tech.trim().length > 0 ? { tech: record.tech.trim() } : {}),
      ...(typeof record.primary === "boolean" ? { primary: record.primary } : {}),
    };
  });
}

function readSection(body: string, heading: string): string | null {
  const match = body.match(new RegExp(`(?:^|\\n)##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i"));
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

function replaceSection(body: string, heading: string, value: string | null | undefined): string {
  const normalized = body.trim();
  const sectionPattern = new RegExp(`(?:\\n|^)##\\s+${heading}\\s*\\n[\\s\\S]*?(?=\\n##\\s+|$)`, "i");
  const withoutSection = normalized.replace(sectionPattern, "").trim();
  if (value === undefined) {
    return normalized;
  }

  const nextSections = [withoutSection];
  if (value !== null && value.length > 0) {
    nextSections.push(`## ${heading}\n${value}`);
  }
  return nextSections.filter((section) => section.trim().length > 0).join("\n\n").trimEnd() + "\n";
}

async function writeProjectAuditNote(projectId: string, actorId: string, message: string, vaultRoot: string, now: Date) {
  const sharedRoot = resolveSharedVaultPath(vaultRoot);
  const auditId = `audit-${randomUUID().slice(0, 8)}`;
  await mkdir(join(sharedRoot, "audit"), { recursive: true });
  const document = [
    "---",
    `id: ${JSON.stringify(auditId)}`,
    'type: "audit-note"',
    `task_id: ${JSON.stringify(projectId)}`,
    `message: ${JSON.stringify(message)}`,
    `source: ${JSON.stringify(actorId)}`,
    "confidence: 1",
    `created_at: ${JSON.stringify(now.toISOString())}`,
    "---",
    "",
  ].join("\n");
  await writeFile(join(sharedRoot, "audit", `${auditId}.md`), document, "utf8");
}

export async function updateProjectMetadata(projectId: string, body: unknown, options: { vaultRoot?: string } = {}) {
  const patch = typeof body === "object" && body !== null && "patch" in body && typeof body.patch === "object" && body.patch !== null
    ? body.patch as Record<string, unknown>
    : {};
  const actorId = typeof body === "object" && body !== null && "actorId" in body && typeof body.actorId === "string"
    ? body.actorId
    : "@relayhq-web";

  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const projectFilePath = join(resolveSharedVaultPath(vaultRoot), "projects", `${projectId}.md`);
  const current = await readProjectDocument(projectFilePath);
  const name = readOptionalString(patch.name);
  if (name !== undefined && name !== null && name.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "name must not be empty when provided." });
  }
  const description = readOptionalString(patch.description);
  const status = readOptionalString(patch.status);
  const codebaseRoot = readOptionalString(patch.codebase_root);
  const codebases = readOptionalCodebases(patch.codebases);

  const frontmatterPatch = {
    ...(name === undefined ? {} : { name: name ?? current.frontmatter.name }),
    ...(codebaseRoot === undefined ? {} : { codebase_root: codebaseRoot }),
    ...(codebases === undefined ? {} : { codebases }),
  };

  const result = await syncProjectDocument({
    filePath: projectFilePath,
    actorId,
    mutate: () => frontmatterPatch,
    mutateBody: (currentBody) => {
      let nextBody = currentBody;
      if (description !== undefined) {
        nextBody = replaceSection(nextBody, "Description", description);
      }
      if (status !== undefined) {
        nextBody = replaceSection(nextBody, "Status", status);
      }
      return nextBody;
    },
  });

  await writeProjectAuditNote(projectId, actorId, `Updated project metadata for ${result.frontmatter.name}`, vaultRoot, new Date());

  return {
    id: result.frontmatter.id,
    name: result.frontmatter.name,
    codebases: result.frontmatter.codebases ?? (result.frontmatter.codebase_root ? [{ name: "main", path: result.frontmatter.codebase_root, primary: true }] : []),
    description: readSection(result.body, "Description"),
    status: readSection(result.body, "Status"),
  };
}

export async function deleteProject(projectId: string, options: { vaultRoot?: string } = {}) {
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  try {
    const result = await deleteProjectDocuments(vaultRoot, projectId);
    await writeProjectAuditNote(projectId, "@relayhq-web", `Deleted project ${projectId}`, vaultRoot, new Date());
    return { success: true, deletedPaths: result.deletedPaths };
  } catch (error) {
    if (error instanceof Error && error.message === `Project ${projectId} was not found.`) {
      throw createError({ statusCode: 404, statusMessage: error.message });
    }
    throw error;
  }
}

export default defineEventHandler(async (event) => {
  if (event.method !== "PATCH" && event.method !== "DELETE") {
    throw createError({ statusCode: 405, statusMessage: "Method not allowed." });
  }

  const projectId = getRouterParam(event, "id");
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: "Project id is required." });
  }

  try {
    if (event.method === "DELETE") {
      return await deleteProject(projectId);
    }
    return await updateProjectMetadata(projectId, await readBody(event));
  } catch (error) {
    throw createError({
      statusCode: typeof error === "object" && error !== null && "statusCode" in error ? Number((error as { statusCode: number }).statusCode) : error instanceof Error && error.name === "VaultSchemaError" ? 400 : 500,
      statusMessage: error instanceof Error ? error.message : "Unable to update project.",
    });
  }
});
