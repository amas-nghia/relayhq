import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { assertCoordinatorThreadFrontmatter, VaultSchemaError, type CoordinatorThreadFrontmatter } from "../../../shared/vault/schema";
import { readCanonicalVaultReadModel } from "./read";
import { VAULT_COLLECTION_DIRECTORIES, type VaultDocument } from "./repository";

const COORDINATOR_THREAD_FRONTMATTER_KEYS: ReadonlyArray<keyof CoordinatorThreadFrontmatter> = [
  "id",
  "type",
  "workspace_id",
  "project_id",
  "coordinator_agent_id",
  "active_session_id",
  "status",
  "created_at",
  "updated_at",
];

const pendingOpens = new Map<string, Promise<CoordinatorThreadOpenResult>>();

export interface CoordinatorThreadOpenResult extends VaultDocument<CoordinatorThreadFrontmatter> {
  readonly filePath: string;
  readonly created: boolean;
}

export interface OpenCoordinatorThreadRequest {
  readonly vaultRoot: string;
  readonly projectId: string;
  readonly coordinatorAgentId: string;
  readonly activeSessionId?: string | null;
  readonly now?: Date;
}

function toIso(date: Date): string {
  return date.toISOString();
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
  if (lines[0] !== "---") {
    throw new Error("Coordinator thread document must start with YAML frontmatter.");
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingIndex === -1) {
    throw new Error("Coordinator thread document is missing a closing frontmatter fence.");
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
    if (!match) throw new Error(`Unsupported frontmatter line: ${line}`);
    record[match[1]] = parseValue(match[2]);
  }
  return record;
}

function serializeCoordinatorThreadFrontmatter(frontmatter: CoordinatorThreadFrontmatter): string {
  return COORDINATOR_THREAD_FRONTMATTER_KEYS
    .map((key) => `${String(key)}: ${stringifyValue(frontmatter[key])}`)
    .join("\n");
}

export function serializeCoordinatorThreadDocument(frontmatter: CoordinatorThreadFrontmatter, body: string): string {
  const bodySuffix = body.length === 0 ? "" : `\n${body}`;
  return `---\n${serializeCoordinatorThreadFrontmatter(frontmatter)}\n---${bodySuffix}`;
}

export function parseCoordinatorThreadDocument(content: string): Omit<VaultDocument<CoordinatorThreadFrontmatter>, "sourcePath"> {
  const split = splitDocument(content);
  const frontmatter = parseFrontmatter(split.frontmatter);
  assertCoordinatorThreadFrontmatter(frontmatter);
  return { frontmatter, body: split.body };
}

export async function readCoordinatorThreadDocument(filePath: string): Promise<VaultDocument<CoordinatorThreadFrontmatter>> {
  const content = await readFile(filePath, "utf8");
  return {
    sourcePath: filePath,
    ...parseCoordinatorThreadDocument(content),
  };
}

async function writeCoordinatorThreadDocumentAtomic(filePath: string, document: Omit<VaultDocument<CoordinatorThreadFrontmatter>, "sourcePath">): Promise<void> {
  const directory = dirname(filePath);
  const tempFilePath = join(directory, `.${basename(filePath)}.${randomUUID()}.tmp`);

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(tempFilePath, serializeCoordinatorThreadDocument(document.frontmatter, document.body), "utf8");
    await rename(tempFilePath, filePath);
  } finally {
    await rm(tempFilePath, { force: true }).catch(() => undefined);
  }
}

function coordinatorThreadFilePath(vaultRoot: string, projectId: string): string {
  return join(vaultRoot, VAULT_COLLECTION_DIRECTORIES.coordinatorThreads, `coordinator-thread-${projectId}.md`);
}

export async function openCoordinatorThread(request: OpenCoordinatorThreadRequest): Promise<CoordinatorThreadOpenResult> {
  const key = [request.vaultRoot, request.projectId].join("\0");
  const pending = pendingOpens.get(key);
  if (pending) return await pending;

  const opened = openCoordinatorThreadOnce(request).finally(() => {
    pendingOpens.delete(key);
  });
  pendingOpens.set(key, opened);
  return await opened;
}

async function openCoordinatorThreadOnce(request: OpenCoordinatorThreadRequest): Promise<CoordinatorThreadOpenResult> {
  const now = request.now ?? new Date();
  const nowIso = toIso(now);
  const readModel = await readCanonicalVaultReadModel(request.vaultRoot, now);
  const existing = (readModel.coordinatorThreads ?? []).find((thread) => thread.projectId === request.projectId && thread.status === "active") ?? null;

  if (existing) {
    return {
      sourcePath: existing.sourcePath,
      filePath: join(request.vaultRoot, existing.sourcePath),
      body: existing.body,
      created: false,
      frontmatter: {
        id: existing.id,
        type: "coordinator-thread",
        workspace_id: existing.workspaceId,
        project_id: existing.projectId,
        coordinator_agent_id: existing.coordinatorAgentId,
        active_session_id: existing.activeSessionId,
        status: existing.status,
        created_at: existing.createdAt,
        updated_at: existing.updatedAt,
      },
    };
  }

  const project = readModel.projects.find((entry) => entry.id === request.projectId) ?? null;
  if (!project) {
    throw new VaultSchemaError([{ field: "project_id", message: `Project ${request.projectId} was not found` }]);
  }

  const frontmatter = {
    id: `coordinator-thread-${request.projectId}`,
    type: "coordinator-thread" as const,
    workspace_id: project.workspaceId,
    project_id: project.id,
    coordinator_agent_id: request.coordinatorAgentId,
    active_session_id: request.activeSessionId ?? null,
    status: "active" as const,
    created_at: nowIso,
    updated_at: nowIso,
  } satisfies CoordinatorThreadFrontmatter;
  assertCoordinatorThreadFrontmatter(frontmatter);

  const body = [
    `# ${project.name} Coordinator Thread`,
    "",
    "Durable project coordinator conversation anchor. Agent session transcripts are stored separately under `vault/shared/threads/agent-session-*.jsonl`.",
  ].join("\n");
  const filePath = coordinatorThreadFilePath(request.vaultRoot, project.id);
  await writeCoordinatorThreadDocumentAtomic(filePath, { frontmatter, body });

  return {
    sourcePath: join(VAULT_COLLECTION_DIRECTORIES.coordinatorThreads, `coordinator-thread-${project.id}.md`),
    filePath,
    created: true,
    frontmatter,
    body,
  };
}

export async function setCoordinatorThreadActiveSession(filePath: string, sessionId: string, now: Date = new Date()): Promise<VaultDocument<CoordinatorThreadFrontmatter>> {
  const current = await readCoordinatorThreadDocument(filePath);
  const next = {
    ...current.frontmatter,
    active_session_id: sessionId,
    updated_at: toIso(now),
  } satisfies CoordinatorThreadFrontmatter;
  assertCoordinatorThreadFrontmatter(next);
  await writeCoordinatorThreadDocumentAtomic(filePath, { frontmatter: next, body: current.body });
  return { sourcePath: current.sourcePath, frontmatter: next, body: current.body };
}

export async function clearCoordinatorThreadActiveSession(filePath: string, now: Date = new Date()): Promise<VaultDocument<CoordinatorThreadFrontmatter>> {
  const current = await readCoordinatorThreadDocument(filePath);
  const next = {
    ...current.frontmatter,
    active_session_id: null,
    updated_at: toIso(now),
  } satisfies CoordinatorThreadFrontmatter;
  assertCoordinatorThreadFrontmatter(next);
  await writeCoordinatorThreadDocumentAtomic(filePath, { frontmatter: next, body: current.body });
  return { sourcePath: current.sourcePath, frontmatter: next, body: current.body };
}
