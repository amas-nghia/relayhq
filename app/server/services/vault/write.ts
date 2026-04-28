import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  assertTaskFrontmatter,
  VaultSchemaError,
  type TaskHistoryEntry,
  type TaskLink,
} from "../../../shared/vault/schema";
import type { TaskFrontmatter, VaultTaskDocument } from "./repository";
import {
  acquireTaskFileLock,
  assertTaskWriteable,
  claimTaskLock,
  DEFAULT_LOCK_TTL_MS,
  DEFAULT_STALE_AFTER_MS,
  VaultStaleWriteError,
} from "./lock";
import { validateTaskWrite } from "./validation";

const TASK_FRONTMATTER_KEYS: ReadonlyArray<keyof TaskFrontmatter> = [
  "id",
  "type",
  "version",
  "workspace_id",
  "project_id",
  "board_id",
  "column",
  "status",
  "priority",
  "title",
  "assignee",
  "created_by",
  "created_at",
  "updated_at",
  "heartbeat_at",
  "execution_started_at",
  "execution_notes",
  "progress",
  "history",
  "next_run_at",
  "cron_schedule",
  "dispatch_status",
  "dispatch_reason",
  "last_dispatch_attempt_at",
  "approval_needed",
  "approval_requested_by",
  "approval_reason",
  "approved_by",
  "approved_at",
  "approval_outcome",
  "blocked_reason",
  "blocked_since",
  "result",
  "completed_at",
  "tokens_used",
  "model",
  "cost_usd",
  "parent_task_id",
  "source_issue_id",
  "github_issue_id",
  "depends_on",
  "tags",
  "links",
  "locked_by",
  "locked_at",
  "lock_expires_at",
];

export interface SyncTaskRequest {
  readonly filePath: string;
  readonly actorId: string;
  readonly mutate: (task: TaskFrontmatter) => unknown;
  readonly now?: Date;
  readonly lockTtlMs?: number;
  readonly staleAfterMs?: number;
  readonly recoverStaleLock?: boolean;
  readonly releaseLock?: boolean;
  readonly historyEntry?: TaskHistoryEntry;
}

export interface SyncTaskResult extends VaultTaskDocument {
  readonly filePath: string;
  readonly previous: TaskFrontmatter;
}

export interface CreateTaskDocumentRequest {
  readonly filePath: string;
  readonly frontmatter: TaskFrontmatter;
  readonly body?: string;
}

export interface CreateTaskDocumentResult extends VaultTaskDocument {
  readonly filePath: string;
}

function toIso(date: Date): string {
  return date.toISOString();
}

function stringifyTaskValue(value: unknown): string {
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

function parseTaskValue(value: string): unknown {
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
    throw new Error("Task document must start with YAML frontmatter.");
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");

  if (closingIndex === -1) {
    throw new Error("Task document is missing a closing frontmatter fence.");
  }

  return {
    frontmatter: lines.slice(1, closingIndex).join("\n"),
    body: lines.slice(closingIndex + 1).join("\n"),
  };
}

function parseTaskFrontmatter(frontmatter: string): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);

    if (!match) {
      throw new Error(`Unsupported frontmatter line: ${line}`);
    }

    record[match[1]] = parseTaskValue(match[2]);
  }

  return record;
}

type ParsedTaskDocument = Omit<VaultTaskDocument, "sourcePath">;

export function parseTaskDocument(content: string): ParsedTaskDocument {
  const split = splitDocument(content);
  const frontmatter = parseTaskFrontmatter(split.frontmatter);

  assertTaskFrontmatter(frontmatter);

  return {
    frontmatter,
    body: split.body,
  };
}

function serializeTaskLinks(links: ReadonlyArray<TaskLink>): string {
  return JSON.stringify(links);
}

function serializeTaskFrontmatter(frontmatter: TaskFrontmatter): string {
  return TASK_FRONTMATTER_KEYS.flatMap((key) => {
    if (frontmatter[key] === undefined) return [];
    const value = key === "links" ? serializeTaskLinks(frontmatter.links) : stringifyTaskValue(frontmatter[key]);
    return [`${String(key)}: ${value}`];
  }).join("\n");
}

export function serializeTaskDocument(frontmatter: TaskFrontmatter, body: string): string {
  const bodySuffix = body.length === 0 ? "" : `\n${body}`;

  return `---\n${serializeTaskFrontmatter(frontmatter)}\n---${bodySuffix}`;
}

export async function readTaskDocument(filePath: string): Promise<VaultTaskDocument> {
  const content = await readFile(filePath, "utf8");
  return {
    sourcePath: filePath,
    ...parseTaskDocument(content),
  };
}

async function writeTaskDocumentAtomic(filePath: string, document: Omit<VaultTaskDocument, "sourcePath">): Promise<void> {
  const directory = dirname(filePath);
  const tempFilePath = join(directory, `.${basename(filePath)}.${randomUUID()}.tmp`);

  await mkdir(directory, { recursive: true });

  try {
    await writeFile(tempFilePath, serializeTaskDocument(document.frontmatter, document.body), "utf8");
    await rename(tempFilePath, filePath);
  } finally {
    await rm(tempFilePath, { force: true }).catch(() => undefined);
  }
}

function applyTaskPatch(
  base: TaskFrontmatter,
  patch: Readonly<Partial<TaskFrontmatter>>,
  now: Date,
  actorId: string,
  lockTtlMs: number,
  releaseLock: boolean,
  historyEntry: TaskHistoryEntry | undefined,
): TaskFrontmatter {
  const lockedAt = base.locked_by === actorId && base.locked_at !== null ? base.locked_at : toIso(now);
  const history = historyEntry === undefined
    ? base.history
    : [...(base.history ?? []), historyEntry];

  return {
    ...base,
    ...patch,
    ...(history === undefined ? {} : { history }),
    id: base.id,
    type: base.type,
    version: base.version,
    workspace_id: base.workspace_id,
    project_id: base.project_id,
    board_id: base.board_id,
    created_by: base.created_by,
    created_at: base.created_at,
    updated_at: toIso(now),
    heartbeat_at: toIso(now),
    locked_by: releaseLock ? null : actorId,
    locked_at: releaseLock ? null : lockedAt,
    lock_expires_at: releaseLock ? null : toIso(new Date(now.getTime() + lockTtlMs)),
  } as TaskFrontmatter;
}

export async function syncTaskDocument(request: SyncTaskRequest): Promise<SyncTaskResult> {
  const now = request.now ?? new Date();
  const staleAfterMs = request.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const lockTtlMs = request.lockTtlMs ?? DEFAULT_LOCK_TTL_MS;
  const fileLock = await acquireTaskFileLock(request.filePath, {
    actorId: request.actorId,
    now,
    lockTtlMs,
    staleAfterMs,
  });

  try {
    const current = await readTaskDocument(request.filePath);

    try {
      assertTaskWriteable(current.frontmatter, request.actorId, now, staleAfterMs);
    } catch (error) {
      if (!(request.recoverStaleLock && error instanceof VaultStaleWriteError)) {
        throw error;
      }
    }

    const leased = claimTaskLock(current.frontmatter, {
      actorId: request.actorId,
      now,
      lockTtlMs,
    });
    const patch = request.mutate(leased);
    const validation = validateTaskWrite({
      current: leased,
      patch,
      body: current.body,
    });

    if (!validation.valid) {
      throw new VaultSchemaError(validation.issues);
    }

    const next = applyTaskPatch(
      leased,
      patch as Readonly<Partial<TaskFrontmatter>>,
      now,
      request.actorId,
      lockTtlMs,
      request.releaseLock ?? false,
      request.historyEntry,
    );

    assertTaskFrontmatter(next);
    await writeTaskDocumentAtomic(request.filePath, { frontmatter: next, body: current.body });

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

export async function createTaskDocument(request: CreateTaskDocumentRequest): Promise<CreateTaskDocumentResult> {
  const body = request.body ?? "";
  const validation = validateTaskWrite({
    current: request.frontmatter,
    patch: {},
    body,
  });

  if (!validation.valid) {
    throw new VaultSchemaError(validation.issues);
  }

  assertTaskFrontmatter(request.frontmatter);
  await writeTaskDocumentAtomic(request.filePath, {
    frontmatter: request.frontmatter,
    body,
  });

  return {
    sourcePath: request.filePath,
    filePath: request.filePath,
    frontmatter: request.frontmatter,
    body,
  };
}

export { VaultSchemaError } from "../../../shared/vault/schema";
