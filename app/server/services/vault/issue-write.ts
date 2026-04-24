import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { assertIssueFrontmatter, VaultSchemaError, type IssueFrontmatter, type TaskPriority, type IssueStatus, VAULT_SCHEMA_VERSION } from "../../../shared/vault/schema";
import { acquireVaultFileLock, DEFAULT_LOCK_TTL_MS, DEFAULT_STALE_AFTER_MS } from "./lock";
import type { VaultDocument } from "./repository";

const ISSUE_FRONTMATTER_KEYS: ReadonlyArray<keyof IssueFrontmatter> = [
  "id",
  "type",
  "version",
  "workspace_id",
  "project_id",
  "status",
  "priority",
  "title",
  "reported_by",
  "discovered_during_task_id",
  "linked_task_ids",
  "tags",
  "created_at",
  "updated_at",
];

export interface CreateIssueInput {
  readonly title: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly reportedBy: string;
  readonly priority: TaskPriority;
  readonly problem?: string;
  readonly context?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly discoveredDuringTaskId?: string | null;
  readonly linkedTaskIds?: ReadonlyArray<string>;
  readonly status?: IssueStatus;
  readonly now?: Date;
}

export interface CreateIssueResult extends VaultDocument<IssueFrontmatter> {
  readonly filePath: string;
}

export interface SyncIssueRequest {
  readonly filePath: string;
  readonly actorId: string;
  readonly mutate: (issue: IssueFrontmatter) => unknown;
  readonly mutateBody?: (body: string, issue: IssueFrontmatter) => string;
  readonly now?: Date;
  readonly lockTtlMs?: number;
  readonly staleAfterMs?: number;
}

export interface SyncIssueResult extends VaultDocument<IssueFrontmatter> {
  readonly filePath: string;
  readonly previous: IssueFrontmatter;
}

function stringifyValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function parseValue(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return JSON.parse(trimmed);
  }
  return trimmed;
}

function splitDocument(content: string): { readonly frontmatter: string; readonly body: string } {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") throw new Error("Issue document must start with YAML frontmatter.");
  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingIndex === -1) throw new Error("Issue document is missing a closing frontmatter fence.");
  return { frontmatter: lines.slice(1, closingIndex).join("\n"), body: lines.slice(closingIndex + 1).join("\n") };
}

function parseFrontmatter(frontmatter: string): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) throw new Error(`Unsupported frontmatter line: ${line}`);
    record[match[1]] = parseValue(match[2]);
  }
  return record;
}

function parseIssueFrontmatter(frontmatter: string): IssueFrontmatter {
  const record = parseFrontmatter(frontmatter);
  const parsed = {
    id: record.id as string,
    type: record.type as "issue",
    version: record.version as IssueFrontmatter["version"],
    workspace_id: record.workspace_id as string,
    project_id: record.project_id as string,
    status: record.status as IssueFrontmatter["status"],
    priority: record.priority as IssueFrontmatter["priority"],
    title: record.title as string,
    reported_by: record.reported_by as string,
    discovered_during_task_id: (record.discovered_during_task_id ?? null) as string | null,
    linked_task_ids: (record.linked_task_ids ?? []) as ReadonlyArray<string>,
    tags: (record.tags ?? []) as ReadonlyArray<string>,
    created_at: record.created_at as string,
    updated_at: record.updated_at as string,
  } satisfies IssueFrontmatter;
  assertIssueFrontmatter(parsed);
  return parsed;
}

export function serializeIssueDocument(frontmatter: IssueFrontmatter, body: string): string {
  const yaml = ISSUE_FRONTMATTER_KEYS.map((key) => `${String(key)}: ${stringifyValue(frontmatter[key])}`).join("\n");
  return `---\n${yaml}\n---${body.length === 0 ? "" : `\n${body}`}`;
}

export async function readIssueDocument(filePath: string): Promise<VaultDocument<IssueFrontmatter>> {
  const content = await readFile(filePath, "utf8");
  const split = splitDocument(content);
  return { sourcePath: filePath, frontmatter: parseIssueFrontmatter(split.frontmatter), body: split.body };
}

function buildIssueBody(problem?: string, context?: string): string {
  const parts: string[] = [];
  parts.push("## Problem\n\n" + (problem?.trim() || ""));
  parts.push("## Context\n\n" + (context?.trim() || ""));
  return parts.join("\n\n").trimEnd() + "\n";
}

export async function createIssueDocument(filePath: string, input: CreateIssueInput): Promise<CreateIssueResult> {
  const now = input.now ?? new Date();
  const issueId = `issue-${randomUUID()}`;
  const frontmatter: IssueFrontmatter = {
    id: issueId,
    type: "issue",
    version: VAULT_SCHEMA_VERSION,
    workspace_id: input.workspaceId,
    project_id: input.projectId,
    status: input.status ?? "open",
    priority: input.priority,
    title: input.title.trim(),
    reported_by: input.reportedBy.trim(),
    discovered_during_task_id: input.discoveredDuringTaskId ?? null,
    linked_task_ids: [...new Set(input.linkedTaskIds ?? [])].sort(),
    tags: [...new Set(input.tags ?? [])].sort(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  assertIssueFrontmatter(frontmatter);
  const targetFilePath = join(dirname(filePath), `${issueId}.md`);
  await mkdir(dirname(targetFilePath), { recursive: true });
  await writeFile(targetFilePath, serializeIssueDocument(frontmatter, buildIssueBody(input.problem, input.context)), { flag: "wx" });
  return { filePath: targetFilePath, sourcePath: targetFilePath, frontmatter, body: buildIssueBody(input.problem, input.context) };
}

function applyIssuePatch(base: IssueFrontmatter, patch: Readonly<Partial<IssueFrontmatter>>, now: Date): IssueFrontmatter {
  return { ...base, ...patch, id: base.id, type: base.type, version: base.version, workspace_id: base.workspace_id, project_id: base.project_id, created_at: base.created_at, updated_at: now.toISOString() };
}

export async function syncIssueDocument(request: SyncIssueRequest): Promise<SyncIssueResult> {
  const now = request.now ?? new Date();
  const fileLock = await acquireVaultFileLock(request.filePath, { actorId: request.actorId, now, lockTtlMs: request.lockTtlMs ?? DEFAULT_LOCK_TTL_MS, staleAfterMs: request.staleAfterMs ?? DEFAULT_STALE_AFTER_MS });
  try {
    const current = await readIssueDocument(request.filePath);
    const patch = request.mutate(current.frontmatter) as Readonly<Partial<IssueFrontmatter>>;
    const next = applyIssuePatch(current.frontmatter, patch, now);
    const nextBody = request.mutateBody ? request.mutateBody(current.body, next) : current.body;
    assertIssueFrontmatter(next);
    const tempFilePath = join(dirname(request.filePath), `.${basename(request.filePath)}.${randomUUID()}.tmp`);
    try {
      await writeFile(tempFilePath, serializeIssueDocument(next, nextBody), "utf8");
      await rename(tempFilePath, request.filePath);
    } finally {
      await rm(tempFilePath, { force: true }).catch(() => undefined);
    }
    return { filePath: request.filePath, sourcePath: current.sourcePath, previous: current.frontmatter, frontmatter: next, body: nextBody };
  } finally {
    await fileLock.release();
  }
}
