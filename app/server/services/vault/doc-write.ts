import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { assertDocFrontmatter, VaultSchemaError, type DocFrontmatter, type DocStatus, type DocType } from "../../../shared/vault/schema";
import type { VaultDocument } from "./repository";

export interface CreateDocInput {
  readonly id?: string;
  readonly title: string;
  readonly docType: DocType;
  readonly workspaceId: string;
  readonly projectId?: string | null;
  readonly status?: DocStatus;
  readonly tags?: ReadonlyArray<string>;
  readonly body?: string;
  readonly now?: Date;
}

export interface SyncDocInput {
  readonly filePath: string;
  readonly patch: Readonly<Partial<DocFrontmatter>>;
  readonly body?: string;
  readonly now?: Date;
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
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) return JSON.parse(trimmed);
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return JSON.parse(trimmed);
  return trimmed;
}

function splitDocument(content: string) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") {
    throw new Error("Doc document must start with YAML frontmatter.");
  }
  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingIndex === -1) {
    throw new Error("Doc document is missing a closing frontmatter fence.");
  }
  return {
    frontmatter: lines.slice(1, closingIndex).join("\n"),
    body: lines.slice(closingIndex + 1).join("\n"),
  };
}

function parseFrontmatter(frontmatter: string): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) {
      throw new Error(`Unsupported frontmatter line: ${line}`);
    }
    record[match[1]] = parseValue(match[2]);
  }
  return record;
}

function normalizeTags(tags: ReadonlyArray<string> | undefined): ReadonlyArray<string> {
  if (tags === undefined) return [];
  return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))].sort((left, right) => left.localeCompare(right));
}

export function serializeDocDocument(frontmatter: DocFrontmatter, body: string): string {
  const keys: ReadonlyArray<keyof DocFrontmatter> = ["id", "type", "doc_type", "workspace_id", "project_id", "title", "status", "created_at", "updated_at", "tags"];
  const content = keys
    .filter((key) => frontmatter[key] !== undefined)
    .map((key) => `${String(key)}: ${stringifyValue(frontmatter[key])}`)
    .join("\n");
  return `---\n${content}\n---${body.length > 0 ? `\n${body}` : ""}`;
}

export async function readDocDocument(filePath: string): Promise<VaultDocument<DocFrontmatter>> {
  const content = await readFile(filePath, "utf8");
  const split = splitDocument(content);
  const frontmatter = parseFrontmatter(split.frontmatter);
  assertDocFrontmatter(frontmatter);
  return { sourcePath: filePath, frontmatter, body: split.body };
}

async function writeDocDocumentAtomic(filePath: string, frontmatter: DocFrontmatter, body: string) {
  const directory = dirname(filePath);
  const tempFilePath = join(directory, `.${basename(filePath)}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(tempFilePath, serializeDocDocument(frontmatter, body), "utf8");
    await rename(tempFilePath, filePath);
  } finally {
    await rm(tempFilePath, { force: true }).catch(() => undefined);
  }
}

export async function createDocDocument(filePath: string, input: CreateDocInput): Promise<VaultDocument<DocFrontmatter>> {
  const now = input.now ?? new Date();
  const frontmatter = {
    id: input.id ?? `doc-${randomUUID().slice(0, 8)}`,
    type: "doc" as const,
    doc_type: input.docType,
    workspace_id: input.workspaceId,
    ...(input.projectId === undefined ? {} : { project_id: input.projectId }),
    title: input.title.trim(),
    status: input.status ?? "draft",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    tags: normalizeTags(input.tags),
  } satisfies DocFrontmatter;
  assertDocFrontmatter(frontmatter);
  const body = input.body?.trim() ?? "";
  await writeDocDocumentAtomic(filePath, frontmatter, body);
  return { sourcePath: filePath, frontmatter, body };
}

export async function syncDocDocument(input: SyncDocInput): Promise<VaultDocument<DocFrontmatter>> {
  const current = await readDocDocument(input.filePath);
  const now = input.now ?? new Date();
  const next = {
    ...current.frontmatter,
    ...input.patch,
    id: current.frontmatter.id,
    type: current.frontmatter.type,
    workspace_id: current.frontmatter.workspace_id,
    created_at: current.frontmatter.created_at,
    updated_at: now.toISOString(),
  } satisfies DocFrontmatter;
  assertDocFrontmatter(next);
  const body = input.body === undefined ? current.body : input.body.trim();
  await writeDocDocumentAtomic(input.filePath, next, body);
  return { sourcePath: input.filePath, frontmatter: next, body };
}

export { VaultSchemaError };
