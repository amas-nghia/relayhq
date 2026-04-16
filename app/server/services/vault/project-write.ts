import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { ProjectFrontmatter, VaultDocument } from "./repository";
import {
  acquireVaultFileLock,
  DEFAULT_LOCK_TTL_MS,
  DEFAULT_STALE_AFTER_MS,
} from "./lock";
import { VaultSchemaError } from "../../../shared/vault/schema";
import { validateProjectWrite } from "./validation";

const PROJECT_FRONTMATTER_KEYS: ReadonlyArray<keyof ProjectFrontmatter> = [
  "id",
  "type",
  "workspace_id",
  "name",
  "created_at",
  "updated_at",
];

type ParsedProjectDocument = Omit<VaultDocument<ProjectFrontmatter>, "sourcePath">;

export interface SyncProjectRequest {
  readonly filePath: string;
  readonly actorId: string;
  readonly mutate: (project: ProjectFrontmatter) => unknown;
  readonly now?: Date;
  readonly lockTtlMs?: number;
  readonly staleAfterMs?: number;
}

export interface SyncProjectResult extends VaultDocument<ProjectFrontmatter> {
  readonly filePath: string;
  readonly previous: ProjectFrontmatter;
}

function toIso(date: Date): string {
  return date.toISOString();
}

function stringifyValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function parseValue(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed === "null") {
    return null;
  }

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    return JSON.parse(trimmed);
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }

  return trimmed;
}

function splitDocument(content: string): { readonly frontmatter: string; readonly body: string } {
  const lines = content.split(/\r?\n/);

  if (lines[0] !== "---") {
    throw new Error("Project document must start with YAML frontmatter.");
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");

  if (closingIndex === -1) {
    throw new Error("Project document is missing a closing frontmatter fence.");
  }

  return {
    frontmatter: lines.slice(1, closingIndex).join("\n"),
    body: lines.slice(closingIndex + 1).join("\n"),
  };
}

function parseFrontmatter(frontmatter: string): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);

    if (!match) {
      throw new Error(`Unsupported frontmatter line: ${line}`);
    }

    record[match[1]] = parseValue(match[2]);
  }

  return record;
}

function parseProjectFrontmatter(frontmatter: string): ProjectFrontmatter {
  const record = parseFrontmatter(frontmatter);

  if (
    typeof record.id !== "string" ||
    record.type !== "project" ||
    typeof record.workspace_id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.created_at !== "string" ||
    typeof record.updated_at !== "string"
  ) {
    throw new VaultSchemaError([
      { field: "_self", message: "must be a valid project document" },
    ]);
  }

  return {
    id: record.id,
    type: "project",
    workspace_id: record.workspace_id,
    name: record.name,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function serializeProjectFrontmatter(frontmatter: ProjectFrontmatter): string {
  return PROJECT_FRONTMATTER_KEYS.map((key) => `${String(key)}: ${stringifyValue(frontmatter[key])}`).join("\n");
}

export function serializeProjectDocument(frontmatter: ProjectFrontmatter, body: string): string {
  const bodySuffix = body.length === 0 ? "" : `\n${body}`;

  return `---\n${serializeProjectFrontmatter(frontmatter)}\n---${bodySuffix}`;
}

export async function readProjectDocument(filePath: string): Promise<VaultDocument<ProjectFrontmatter>> {
  const content = await readFile(filePath, "utf8");
  const split = splitDocument(content);

  return {
    sourcePath: filePath,
    frontmatter: parseProjectFrontmatter(split.frontmatter),
    body: split.body,
  };
}

async function writeProjectDocumentAtomic(filePath: string, document: ParsedProjectDocument): Promise<void> {
  const directory = dirname(filePath);
  const tempFilePath = join(directory, `.${basename(filePath)}.${randomUUID()}.tmp`);

  await mkdir(directory, { recursive: true });

  try {
    await writeFile(tempFilePath, serializeProjectDocument(document.frontmatter, document.body), "utf8");
    await rename(tempFilePath, filePath);
  } finally {
    await rm(tempFilePath, { force: true }).catch(() => undefined);
  }
}

function applyProjectPatch(base: ProjectFrontmatter, patch: Readonly<Partial<ProjectFrontmatter>>, now: Date): ProjectFrontmatter {
  return {
    ...base,
    ...patch,
    id: base.id,
    type: base.type,
    workspace_id: base.workspace_id,
    created_at: base.created_at,
    updated_at: toIso(now),
  };
}

export async function syncProjectDocument(request: SyncProjectRequest): Promise<SyncProjectResult> {
  const now = request.now ?? new Date();
  const staleAfterMs = request.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const lockTtlMs = request.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
  const fileLock = await acquireVaultFileLock(request.filePath, {
    actorId: request.actorId,
    now,
    lockTtlMs,
    staleAfterMs,
  });

  try {
    const current = await readProjectDocument(request.filePath);

    const patch = request.mutate(current.frontmatter);
    const validation = validateProjectWrite({
      current: current.frontmatter,
      patch,
      body: current.body,
    });

    if (!validation.valid) {
      throw new VaultSchemaError(validation.issues);
    }

    const next = applyProjectPatch(current.frontmatter, patch as Readonly<Partial<ProjectFrontmatter>>, now);

    await writeProjectDocumentAtomic(request.filePath, { frontmatter: next, body: current.body });

    return {
      sourcePath: current.sourcePath,
      filePath: request.filePath,
      previous: current.frontmatter,
      frontmatter: next,
      body: current.body,
    };
  } finally {
    await fileLock.release();
  }
}

export { VaultSchemaError };
