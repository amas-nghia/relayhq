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
  readonly warnings: ReadonlyArray<string>;
}

export interface ProjectCodebaseIndexStatus {
  readonly name: string;
  readonly path: string;
  readonly resolvedPath: string;
  readonly status: "missing-path" | "not-indexed" | "indexed";
  readonly fileCount: number;
  readonly lastIndexedAt: string | null;
  readonly primary: boolean;
  readonly tech?: string;
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

function listCodebaseDocuments(
  storage: Pick<KiokuStorage, "listEntityIds" | "fetchById">,
  projectId: string,
  codebaseName: string,
) {
  return listProjectCodeDocuments(storage, projectId).filter((document) => document.codebaseName === codebaseName);
}

function listConfiguredCodebases(project: Pick<ReadModelProject, "codebases">) {
  return project.codebases;
}

export function listProjectCodebaseStatuses(
  project: Pick<ReadModelProject, "id" | "codebases">,
  vaultRoot: string,
  storage: Pick<KiokuStorage, "listEntityIds" | "fetchById">,
): ReadonlyArray<ProjectCodebaseIndexStatus> {
  return listConfiguredCodebases(project).map((codebase) => {
    const resolvedPath = isAbsolute(codebase.path) ? codebase.path : resolve(vaultRoot, codebase.path);
    const documents = listCodebaseDocuments(storage, project.id, codebase.name);

    if (!existsSync(resolvedPath) || !statSync(resolvedPath).isDirectory()) {
      return {
        name: codebase.name,
        path: codebase.path,
        resolvedPath,
        status: "missing-path",
        fileCount: documents.length,
        lastIndexedAt: documents[0]?.updatedAt ?? null,
        primary: codebase.primary ?? false,
        ...(codebase.tech === undefined ? {} : { tech: codebase.tech }),
      };
    }

    if (documents.length === 0) {
      return {
        name: codebase.name,
        path: codebase.path,
        resolvedPath,
        status: "not-indexed",
        fileCount: 0,
        lastIndexedAt: null,
        primary: codebase.primary ?? false,
        ...(codebase.tech === undefined ? {} : { tech: codebase.tech }),
      };
    }

    const lastIndexedAt = [...documents].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.updatedAt ?? null;
    return {
      name: codebase.name,
      path: codebase.path,
      resolvedPath,
      status: "indexed",
      fileCount: documents.length,
      lastIndexedAt,
      primary: codebase.primary ?? false,
      ...(codebase.tech === undefined ? {} : { tech: codebase.tech }),
    };
  });
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
    return { codebase: null, resolvedPath: null, status: "unconfigured", fileCount: 0, lastIndexedAt: null, warnings: [] };
  }

  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isDirectory()) {
    return { codebase: codebase ? { name: codebase.name, path: codebase.path } : null, resolvedPath, status: "missing-path", fileCount: documents.length, lastIndexedAt: documents[0]?.updatedAt ?? null, warnings: [`Missing codebase path: ${resolvedPath}`] };
  }

  if (documents.length === 0) {
    return { codebase: codebase ? { name: codebase.name, path: codebase.path } : null, resolvedPath, status: "not-indexed", fileCount: 0, lastIndexedAt: null, warnings: [] };
  }

  const lastIndexedAt = [...documents].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.updatedAt ?? null;
  return { codebase: codebase ? { name: codebase.name, path: codebase.path } : null, resolvedPath, status: "indexed", fileCount: documents.length, lastIndexedAt, warnings: [] };
}

export function indexProjectCodebase(
  project: Pick<ReadModelProject, "id" | "workspaceId" | "codebases">,
  vaultRoot: string,
  storage: Pick<KiokuStorage, "upsert" | "fetchById">,
  codebaseName?: string,
): { readonly indexedFiles: number; readonly resolvedPaths: ReadonlyArray<string>; readonly warnings: ReadonlyArray<string> } {
  const codebases = codebaseName === undefined
    ? listConfiguredCodebases(project)
    : listConfiguredCodebases(project).filter((entry) => entry.name === codebaseName);
  if (codebases.length === 0) {
    throw new Error(codebaseName === undefined
      ? `Project ${project.id} does not have any codebases configured.`
      : `Project ${project.id} does not have a codebase named ${codebaseName}.`);
  }

  const warnings: string[] = [];
  const resolvedPaths: string[] = [];
  let indexedFiles = 0;

  for (const codebase of codebases) {
    const resolvedPath = isAbsolute(codebase.path) ? codebase.path : resolve(vaultRoot, codebase.path);
    if (!existsSync(resolvedPath) || !statSync(resolvedPath).isDirectory()) {
      warnings.push(`Skipping missing codebase path for ${codebase.name}: ${resolvedPath}`);
      continue;
    }

    resolvedPaths.push(resolvedPath);
    const updates = indexCodebaseFiles(resolvedPath, {
      workspaceId: project.workspaceId,
      projectId: project.id,
      codebaseName: codebase.name,
    });

    for (const update of updates) {
      const existing = storage.fetchById(update.document.entityId);
      if (existing?.updatedAt === update.document.updatedAt) {
        continue;
      }
      storage.upsert(update.document);
      indexedFiles += 1;
    }
  }

  if (resolvedPaths.length === 0) {
    throw new Error(warnings[0] ?? `Project ${project.id} does not have a readable codebase path.`);
  }

  return { indexedFiles, resolvedPaths, warnings };
}
