import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join, relative } from "node:path";

import { APPROVAL_OUTCOMES, assertAgentFrontmatter, assertAuditNoteFrontmatter, assertDocFrontmatter, assertIssueFrontmatter, assertTaskFrontmatter, assertWorkspaceFrontmatter } from "../../../shared/vault/schema";
import {
  buildVaultReadModel,
  type VaultReadModel,
} from "../../models/read-model";
import { VAULT_COLLECTION_DIRECTORIES } from "./repository";
import type {
  ApprovalFrontmatter,
  AgentFrontmatter,
  AuditNoteFrontmatter,
  BoardFrontmatter,
  ColumnFrontmatter,
  DocFrontmatter,
  IssueFrontmatter,
  ProjectFrontmatter,
  TaskFrontmatter,
  VaultDocument,
  VaultFrontmatter,
  VaultReadCollections,
  WorkspaceFrontmatter,
} from "./repository";

export class VaultReadError extends Error {
  public readonly filePath: string;

  constructor(message: string, filePath: string) {
    super(message);
    this.name = "VaultReadError";
    this.filePath = filePath;
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function parseDocumentValue(value: string, filePath: string): unknown {
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

  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw new VaultReadError(`Invalid frontmatter value: ${(error as Error).message}`, filePath);
    }
  }

  return trimmed;
}

function splitDocument(content: string, filePath: string): { readonly frontmatter: string; readonly body: string } {
  const lines = content.split(/\r?\n/);

  if (lines[0] !== "---") {
    throw new VaultReadError("Vault document must start with YAML frontmatter.", filePath);
  }

  const closingFenceIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingFenceIndex === -1) {
    throw new VaultReadError("Vault document is missing a closing frontmatter fence.", filePath);
  }

  return {
    frontmatter: lines.slice(1, closingFenceIndex).join("\n"),
    body: lines.slice(closingFenceIndex + 1).join("\n"),
  };
}

function parseFrontmatter(frontmatter: string, filePath: string): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (match === null) {
      throw new VaultReadError(`Unsupported frontmatter line: ${line}`, filePath);
    }

    record[match[1]] = parseDocumentValue(match[2], filePath);
  }

  return record;
}

function requireString(record: Record<string, unknown>, field: string, filePath: string): string {
  const value = record[field];
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
}

function requireNullableString(record: Record<string, unknown>, field: string, filePath: string): string | null {
  const value = record[field];
  if (value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
}

function requireBoolean(record: Record<string, unknown>, field: string, filePath: string): boolean {
  const value = record[field];
  if (typeof value === "boolean") {
    return value;
  }
  if (value === 0) return false;
  if (value === 1) return true;

  throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
}

function requireStringArray(record: Record<string, unknown>, field: string, filePath: string): ReadonlyArray<string> {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
  }

  return value.map((item, index) => {
    if (typeof item === "string" && item.trim().length > 0) {
      return item;
    }

    throw new VaultReadError(`Missing or invalid ${field}[${index}].`, filePath);
  });
}

function requireTaskLinks(record: Record<string, unknown>, filePath: string): TaskFrontmatter["links"] {
  const value = record.links;
  if (!Array.isArray(value)) {
    throw new VaultReadError("Missing or invalid links.", filePath);
  }

  return value.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new VaultReadError(`Missing or invalid links[${index}].`, filePath);
    }

    const project = requireString(item as Record<string, unknown>, "project", filePath);
    const thread = requireString(item as Record<string, unknown>, "thread", filePath);
    return { project, thread };
  });
}

function requireNullableTimestamp(record: Record<string, unknown>, field: string, filePath: string): string | null {
  const value = record[field];
  if (value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value))) {
    return value;
  }

  throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
}

function requireTimestamp(record: Record<string, unknown>, field: string, filePath: string): string {
  const value = requireString(record, field, filePath);
  if (Number.isNaN(Date.parse(value))) {
    throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
  }

  return value;
}

function requireNumber(record: Record<string, unknown>, field: string, filePath: string): number {
  const value = record[field];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
}

function requireApprovalOutcome(
  record: Record<string, unknown>,
  field: "outcome" | "approval_outcome",
  filePath: string,
): ApprovalFrontmatter["outcome"] {
  const value = requireString(record, field, filePath);
  if (APPROVAL_OUTCOMES.includes(value as ApprovalFrontmatter["outcome"])) {
    return value as ApprovalFrontmatter["outcome"];
  }

  throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
}

function requireExactType(record: Record<string, unknown>, expectedType: string, filePath: string): void {
  const value = requireString(record, "type", filePath);
  if (value !== expectedType) {
    throw new VaultReadError(`Missing or invalid type. Expected ${expectedType}.`, filePath);
  }
}

function parseWorkspaceFrontmatter(record: Record<string, unknown>, filePath: string): WorkspaceFrontmatter {
  const frontmatter = {
    id: requireString(record, "id", filePath),
    type: "workspace" as const,
    name: requireString(record, "name", filePath),
    owner_ids: [...requireStringArray(record, "owner_ids", filePath)].sort(compareText),
    member_ids: [...requireStringArray(record, "member_ids", filePath)].sort(compareText),
    created_at: requireTimestamp(record, "created_at", filePath),
    updated_at: requireTimestamp(record, "updated_at", filePath),
  } satisfies WorkspaceFrontmatter;

  assertWorkspaceFrontmatter(frontmatter);
  return frontmatter;
}

function parseTaskFrontmatter(record: Record<string, unknown>, filePath: string): TaskFrontmatter {
  const frontmatter = {
    id: requireString(record, "id", filePath),
    type: "task" as const,
    version: requireNumber(record, "version", filePath) as TaskFrontmatter["version"],
    workspace_id: requireString(record, "workspace_id", filePath),
    project_id: requireString(record, "project_id", filePath),
    board_id: requireString(record, "board_id", filePath),
    column: requireString(record, "column", filePath) as TaskFrontmatter["column"],
    status: requireString(record, "status", filePath) as TaskFrontmatter["status"],
    priority: requireString(record, "priority", filePath) as TaskFrontmatter["priority"],
    title: requireString(record, "title", filePath),
    assignee: requireNullableString(record, "assignee", filePath),
    created_by: requireString(record, "created_by", filePath),
    created_at: requireTimestamp(record, "created_at", filePath),
    updated_at: requireTimestamp(record, "updated_at", filePath),
    heartbeat_at: requireNullableTimestamp(record, "heartbeat_at", filePath),
    execution_started_at: requireNullableTimestamp(record, "execution_started_at", filePath),
    execution_notes: requireNullableString(record, "execution_notes", filePath),
    progress: requireNumber(record, "progress", filePath),
    approval_needed: requireBoolean(record, "approval_needed", filePath),
    approval_requested_by: requireNullableString(record, "approval_requested_by", filePath),
    approval_reason: requireNullableString(record, "approval_reason", filePath),
    approved_by: requireNullableString(record, "approved_by", filePath),
    approved_at: requireNullableTimestamp(record, "approved_at", filePath),
    approval_outcome: requireApprovalOutcome(record, "approval_outcome", filePath),
    blocked_reason: requireNullableString(record, "blocked_reason", filePath),
    blocked_since: requireNullableTimestamp(record, "blocked_since", filePath),
    result: requireNullableString(record, "result", filePath),
    completed_at: requireNullableTimestamp(record, "completed_at", filePath),
    parent_task_id: requireNullableString(record, "parent_task_id", filePath),
    ...(record.source_issue_id === undefined ? {} : { source_issue_id: requireNullableString(record, "source_issue_id", filePath) }),
    depends_on: [...requireStringArray(record, "depends_on", filePath)].sort(compareText),
    tags: [...requireStringArray(record, "tags", filePath)].sort(compareText),
    links: requireTaskLinks(record, filePath),
    locked_by: requireNullableString(record, "locked_by", filePath),
    locked_at: requireNullableTimestamp(record, "locked_at", filePath),
    lock_expires_at: requireNullableTimestamp(record, "lock_expires_at", filePath),
  } satisfies TaskFrontmatter;

  assertTaskFrontmatter(frontmatter);
  return frontmatter;
}

function parseProjectFrontmatter(record: Record<string, unknown>, filePath: string): ProjectFrontmatter {
  requireExactType(record, "project", filePath);

  const codebases = Array.isArray(record.codebases)
    ? record.codebases.flatMap((entry, index) => {
      if (typeof entry !== "object" || entry === null) {
        throw new VaultReadError(`Missing or invalid codebases[${index}].`, filePath);
      }

      const item = entry as Record<string, unknown>;
      if (typeof item.name !== "string" || item.name.trim().length === 0 || typeof item.path !== "string" || item.path.trim().length === 0) {
        throw new VaultReadError(`Missing or invalid codebases[${index}].`, filePath);
      }

      return [{
        name: item.name.trim(),
        path: item.path.trim(),
        ...(typeof item.tech === "string" && item.tech.trim().length > 0 ? { tech: item.tech.trim() } : {}),
        ...(typeof item.primary === "boolean" ? { primary: item.primary } : {}),
      }];
    })
    : typeof record.codebase_root === "string" && record.codebase_root.trim().length > 0
      ? [{ name: "main", path: record.codebase_root.trim(), primary: true }]
      : [];

  return {
    id: requireString(record, "id", filePath),
    type: "project",
    workspace_id: requireString(record, "workspace_id", filePath),
    name: requireString(record, "name", filePath),
    ...(record.codebase_root === undefined ? {} : { codebase_root: requireNullableString(record, "codebase_root", filePath) }),
    codebases,
    created_at: requireTimestamp(record, "created_at", filePath),
    updated_at: requireTimestamp(record, "updated_at", filePath),
  };
}

function parseBoardFrontmatter(record: Record<string, unknown>, filePath: string): BoardFrontmatter {
  requireExactType(record, "board", filePath);

  return {
    id: requireString(record, "id", filePath),
    type: "board",
    workspace_id: requireString(record, "workspace_id", filePath),
    project_id: requireString(record, "project_id", filePath),
    name: requireString(record, "name", filePath),
    created_at: requireTimestamp(record, "created_at", filePath),
    updated_at: requireTimestamp(record, "updated_at", filePath),
  };
}

function parseColumnFrontmatter(record: Record<string, unknown>, filePath: string): ColumnFrontmatter {
  requireExactType(record, "column", filePath);

  return {
    id: requireString(record, "id", filePath),
    type: "column",
    workspace_id: requireString(record, "workspace_id", filePath),
    project_id: requireString(record, "project_id", filePath),
    board_id: requireString(record, "board_id", filePath),
    name: requireString(record, "name", filePath),
    position: requireNumber(record, "position", filePath),
    created_at: requireTimestamp(record, "created_at", filePath),
    updated_at: requireTimestamp(record, "updated_at", filePath),
  };
}

function parseApprovalFrontmatter(record: Record<string, unknown>, filePath: string): ApprovalFrontmatter {
  requireExactType(record, "approval", filePath);

  return {
    id: requireString(record, "id", filePath),
    type: "approval",
    workspace_id: requireString(record, "workspace_id", filePath),
    project_id: requireString(record, "project_id", filePath),
    board_id: requireString(record, "board_id", filePath),
    task_id: requireString(record, "task_id", filePath),
    status: requireString(record, "status", filePath),
    outcome: requireApprovalOutcome(record, "outcome", filePath),
    requested_by: requireNullableString(record, "requested_by", filePath),
    requested_at: requireNullableTimestamp(record, "requested_at", filePath),
    decided_by: requireNullableString(record, "decided_by", filePath),
    decided_at: requireNullableTimestamp(record, "decided_at", filePath),
    reason: requireNullableString(record, "reason", filePath),
    created_at: requireTimestamp(record, "created_at", filePath),
    updated_at: requireTimestamp(record, "updated_at", filePath),
  };
}

function parseAgentFrontmatter(record: Record<string, unknown>, filePath: string): AgentFrontmatter {
  requireExactType(record, "agent", filePath);

  const frontmatter = {
    id: requireString(record, "id", filePath),
    type: "agent" as const,
    name: requireString(record, "name", filePath),
    role: requireString(record, "role", filePath),
    roles: record.roles === undefined ? [requireString(record, "role", filePath)] : [...requireStringArray(record, "roles", filePath)].sort(compareText),
    provider: requireString(record, "provider", filePath),
    model: requireString(record, "model", filePath),
    capabilities: [...requireStringArray(record, "capabilities", filePath)].sort(compareText),
    task_types_accepted: [...requireStringArray(record, "task_types_accepted", filePath)].sort(compareText),
    approval_required_for: [...requireStringArray(record, "approval_required_for", filePath)].sort(compareText),
    cannot_do: [...requireStringArray(record, "cannot_do", filePath)].sort(compareText),
    accessible_by: [...requireStringArray(record, "accessible_by", filePath)].sort(compareText),
    skill_file: requireString(record, "skill_file", filePath),
    status: requireString(record, "status", filePath),
    workspace_id: requireString(record, "workspace_id", filePath),
    created_at: requireTimestamp(record, "created_at", filePath),
    updated_at: requireTimestamp(record, "updated_at", filePath),
  } satisfies AgentFrontmatter;

  assertAgentFrontmatter(frontmatter);
  return frontmatter;
}

function parseAuditNoteFrontmatter(record: Record<string, unknown>, filePath: string): AuditNoteFrontmatter {
  const frontmatter = {
    id: requireString(record, "id", filePath),
    type: "audit-note" as const,
    task_id: requireString(record, "task_id", filePath),
    message: requireString(record, "message", filePath),
    source: requireString(record, "source", filePath),
    confidence: requireNumber(record, "confidence", filePath),
    created_at: requireTimestamp(record, "created_at", filePath),
  } satisfies AuditNoteFrontmatter;

  assertAuditNoteFrontmatter(frontmatter);
  return frontmatter;
}

function parseDocFrontmatter(record: Record<string, unknown>, filePath: string): DocFrontmatter {
  const frontmatter = {
    id: requireString(record, "id", filePath),
    type: "doc" as const,
    doc_type: requireString(record, "doc_type", filePath) as DocFrontmatter["doc_type"],
    workspace_id: requireString(record, "workspace_id", filePath),
    ...(record.project_id === undefined ? {} : { project_id: requireNullableString(record, "project_id", filePath) }),
    title: requireString(record, "title", filePath),
    status: requireString(record, "status", filePath) as DocFrontmatter["status"],
    visibility: (record.visibility === undefined ? "project" : requireString(record, "visibility", filePath)) as DocFrontmatter["visibility"],
    access_roles: record.access_roles === undefined ? ["all"] : [...requireStringArray(record, "access_roles", filePath)].sort(compareText),
    sensitive: record.sensitive === undefined ? false : requireBoolean(record, "sensitive", filePath),
    created_at: requireTimestamp(record, "created_at", filePath),
    updated_at: requireTimestamp(record, "updated_at", filePath),
    tags: [...requireStringArray(record, "tags", filePath)].sort(compareText),
  } satisfies DocFrontmatter;

  assertDocFrontmatter(frontmatter);
  return frontmatter;
}

function parseIssueFrontmatter(record: Record<string, unknown>, filePath: string): IssueFrontmatter {
  const frontmatter = {
    id: requireString(record, "id", filePath),
    type: "issue" as const,
    version: requireNumber(record, "version", filePath) as IssueFrontmatter["version"],
    workspace_id: requireString(record, "workspace_id", filePath),
    project_id: requireString(record, "project_id", filePath),
    status: requireString(record, "status", filePath) as IssueFrontmatter["status"],
    priority: requireString(record, "priority", filePath) as IssueFrontmatter["priority"],
    title: requireString(record, "title", filePath),
    reported_by: requireString(record, "reported_by", filePath),
    discovered_during_task_id: requireNullableString(record, "discovered_during_task_id", filePath),
    linked_task_ids: [...requireStringArray(record, "linked_task_ids", filePath)].sort(compareText),
    tags: [...requireStringArray(record, "tags", filePath)].sort(compareText),
    created_at: requireTimestamp(record, "created_at", filePath),
    updated_at: requireTimestamp(record, "updated_at", filePath),
  } satisfies IssueFrontmatter;

  assertIssueFrontmatter(frontmatter);
  return frontmatter;
}

async function readVaultDocument<TFrontmatter extends VaultFrontmatter>(
  vaultRoot: string,
  filePath: string,
  parseFrontmatterRecord: (record: Record<string, unknown>, filePath: string) => TFrontmatter,
): Promise<VaultDocument<TFrontmatter> | null> {
  try {
    const content = await readFile(filePath, "utf8");
    const split = splitDocument(content, filePath);
    const frontmatterRecord = parseFrontmatter(split.frontmatter, filePath);
    const frontmatter = parseFrontmatterRecord(frontmatterRecord, filePath);

    return {
      sourcePath: relative(vaultRoot, filePath),
      body: split.body,
      frontmatter,
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    if (error instanceof VaultReadError) {
      throw error;
    }

    throw new VaultReadError((error as Error).message, filePath);
  }
}

async function readCollection<TFrontmatter extends VaultFrontmatter>(
  vaultRoot: string,
  collectionDirectory: string,
  parseFrontmatterRecord: (record: Record<string, unknown>, filePath: string) => TFrontmatter,
): Promise<ReadonlyArray<VaultDocument<TFrontmatter>>> {
  let entries: ReadonlyArray<Dirent> = [];

  try {
    entries = await readdir(join(vaultRoot, collectionDirectory), { withFileTypes: true });
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw new VaultReadError((error as Error).message, join(vaultRoot, collectionDirectory));
    }
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(vaultRoot, collectionDirectory, entry.name))
    .sort(compareText);

  const documents = await Promise.all(files.map((filePath) => readVaultDocument(vaultRoot, filePath, parseFrontmatterRecord)));
  return documents.filter((document): document is VaultDocument<TFrontmatter> => document !== null);
}

export async function readSharedVaultCollections(vaultRoot: string): Promise<VaultReadCollections> {
  return {
    workspaces: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.workspaces, parseWorkspaceFrontmatter),
    projects: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.projects, parseProjectFrontmatter),
    boards: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.boards, parseBoardFrontmatter),
    columns: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.columns, parseColumnFrontmatter),
    tasks: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.tasks, parseTaskFrontmatter),
    issues: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.issues, parseIssueFrontmatter),
    docs: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.docs, parseDocFrontmatter),
    approvals: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.approvals, parseApprovalFrontmatter),
    auditNotes: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.auditNotes, parseAuditNoteFrontmatter),
    agents: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.agents, parseAgentFrontmatter),
  };
}

export async function readCanonicalVaultReadModel(vaultRoot: string, now: Date = new Date()): Promise<VaultReadModel> {
  return buildVaultReadModel(await readSharedVaultCollections(vaultRoot), now);
}
