import { readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";

import { createError, defineEventHandler, getQuery } from "h3";

import { resolveVaultWorkspaceRoot, validateVaultWorkspaceRoot } from "../../services/vault/runtime";

export interface BrowseDirectoryEntry {
  readonly name: string;
  readonly path: string;
  readonly isVaultRoot: boolean;
}

export interface BrowseDirectoriesResponse {
  readonly currentPath: string;
  readonly parentPath: string | null;
  readonly entries: ReadonlyArray<BrowseDirectoryEntry>;
}

function normalizeRequestedPath(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "path must be a non-empty string when provided." });
  }

  const trimmed = value.trim();
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(trimmed);
}

export async function browseDirectories(rawPath: unknown, options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<BrowseDirectoriesResponse> {
  const fallbackRoot = resolveVaultWorkspaceRoot(options.cwd ?? process.cwd(), options.env ?? process.env);
  const requestedPath = normalizeRequestedPath(rawPath);
  const startPath = requestedPath ?? fallbackRoot ?? homedir();

  let currentPath: string;
  try {
    currentPath = await realpath(startPath);
  } catch {
    throw createError({ statusCode: 404, statusMessage: `Directory ${startPath} was not found.` });
  }

  const directoryEntries = await readdir(currentPath, { withFileTypes: true }).catch(() => {
    throw createError({ statusCode: 403, statusMessage: `Directory ${currentPath} is not accessible.` });
  });

  const entries = await Promise.all(
    directoryEntries
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => {
        const entryPath = resolve(currentPath, entry.name);
        const validation = await validateVaultWorkspaceRoot(entryPath);
        return {
          name: entry.name,
          path: entryPath,
          isVaultRoot: validation.valid,
        } satisfies BrowseDirectoryEntry;
      }),
  );

  const parentPath = dirname(currentPath);

  return {
    currentPath,
    parentPath: parentPath === currentPath ? null : parentPath,
    entries,
  };
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  return await browseDirectories(query.path);
});
