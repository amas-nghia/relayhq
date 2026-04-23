import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import type { ReadModelProject } from "../../models/read-model";
import { indexCodebaseFiles } from "./code-indexer";
import type { KiokuStorage } from "./storage";

export interface ProjectCodeIndexStatus {
  readonly codebase: { readonly name: string; readonly path: string } | null;
  readonly resolvedPath: string | null;
  readonly status: "unconfigured" | "missing-path" | "not-indexed" | "indexed";
  readonly fileCount: number;
  readonly lastIndexedAt: string | null;
}

function selectPrimaryCodebase(project: Pick<ReadModelProject, "codebases">) {
  return project.codebases.find((entry) => entry.primary) ?? project.codebases[0] ?? null;
}

export function resolveProjectCodebaseRoot(project: Pick<ReadModelProject, "codebases">, vaultRoot: string): string | null {
  const codebase = selectPrimaryCodebase(project);
  if (codebase === null) {
    return null;
  }

  return isAbsolute(codebase.path) ? codebase.path : resolve(vaultRoot, codebase.path);
}

function listProjectCodeDocuments(storage: Pick<KiokuStorage, "listEntityIds" | "fetchById">, projectId: string) {
  return storage.listEntityIds()
    .map((entityId) => storage.fetchById(entityId))
    .filter((document): document is NonNullable<ReturnType<KiokuStorage["fetchById"]>> => document !== null)
    .filter((document) => document.entityType === "document" && document.projectId === projectId);
}

export function readProjectCodeIndexStatus(
  project: Pick<ReadModelProject, "id" | "codebases">,
  vaultRoot: string,
  storage: Pick<KiokuStorage, "listEntityIds" | "fetchById">,
): ProjectCodeIndexStatus {
  const resolvedPath = resolveProjectCodebaseRoot(project, vaultRoot);
  const documents = listProjectCodeDocuments(storage, project.id);
  const codebase = selectPrimaryCodebase(project);

  if (resolvedPath === null) {
    return { codebase: null, resolvedPath: null, status: "unconfigured", fileCount: 0, lastIndexedAt: null };
  }

  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isDirectory()) {
    return { codebase: codebase ? { name: codebase.name, path: codebase.path } : null, resolvedPath, status: "missing-path", fileCount: documents.length, lastIndexedAt: documents[0]?.updatedAt ?? null };
  }

  if (documents.length === 0) {
    return { codebase: codebase ? { name: codebase.name, path: codebase.path } : null, resolvedPath, status: "not-indexed", fileCount: 0, lastIndexedAt: null };
  }

  const lastIndexedAt = [...documents].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.updatedAt ?? null;
  return { codebase: codebase ? { name: codebase.name, path: codebase.path } : null, resolvedPath, status: "indexed", fileCount: documents.length, lastIndexedAt };
}

export function indexProjectCodebase(
  project: Pick<ReadModelProject, "id" | "workspaceId" | "codebases">,
  vaultRoot: string,
  storage: Pick<KiokuStorage, "upsert">,
): { readonly indexedFiles: number; readonly resolvedPath: string } {
  const resolvedPath = resolveProjectCodebaseRoot(project, vaultRoot);
  if (resolvedPath === null) {
    throw new Error(`Project ${project.id} does not have a codebase root configured.`);
  }
  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isDirectory()) {
    throw new Error(`Project codebase path is not a readable directory: ${resolvedPath}`);
  }

  const updates = indexCodebaseFiles(resolvedPath, { workspaceId: project.workspaceId, projectId: project.id });
  for (const update of updates) {
    storage.upsert(update.document);
  }

  return { indexedFiles: updates.length, resolvedPath };
}
