import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { i as isTaskHeartbeatStale, d as assertAgentFrontmatter, e as assertAuditNoteFrontmatter, f as assertTaskFrontmatter, g as assertWorkspaceFrontmatter, A as APPROVAL_OUTCOMES } from './runtime.mjs';

function compareText$1(left, right) {
  return left.localeCompare(right);
}
function sortById(items) {
  return [...items].sort((left, right) => {
    const idComparison = compareText$1(left.id, right.id);
    if (idComparison !== 0) {
      return idComparison;
    }
    return compareText$1(left.sourcePath, right.sourcePath);
  });
}
function sortColumns(items) {
  return [...items].sort((left, right) => {
    const workspaceComparison = compareText$1(left.workspaceId, right.workspaceId);
    if (workspaceComparison !== 0) {
      return workspaceComparison;
    }
    const projectComparison = compareText$1(left.projectId, right.projectId);
    if (projectComparison !== 0) {
      return projectComparison;
    }
    const boardComparison = compareText$1(left.boardId, right.boardId);
    if (boardComparison !== 0) {
      return boardComparison;
    }
    const positionComparison = left.position - right.position;
    if (positionComparison !== 0) {
      return positionComparison;
    }
    const idComparison = compareText$1(left.id, right.id);
    if (idComparison !== 0) {
      return idComparison;
    }
    return compareText$1(left.sourcePath, right.sourcePath);
  });
}
function sortStrings(items) {
  return [...items].sort(compareText$1);
}
function groupBy(items, keySelector) {
  const groups = /* @__PURE__ */ new Map();
  for (const item of items) {
    const key = keySelector(item);
    const existing = groups.get(key);
    if (existing === void 0) {
      groups.set(key, [item]);
      continue;
    }
    existing.push(item);
  }
  return new Map([...groups.entries()].map(([key, values]) => [key, values]));
}
function readLinkArray(record) {
  return [...record.links].map((link) => ({ projectId: link.project, threadId: link.thread })).sort((left, right) => {
    const projectComparison = compareText$1(left.projectId, right.projectId);
    if (projectComparison !== 0) {
      return projectComparison;
    }
    return compareText$1(left.threadId, right.threadId);
  });
}
function getLatestApproval(approvals) {
  var _a;
  if (approvals.length === 0) {
    return null;
  }
  return (_a = [...approvals].sort((left, right) => {
    const updatedComparison = compareText$1(right.updatedAt, left.updatedAt);
    if (updatedComparison !== 0) {
      return updatedComparison;
    }
    const createdComparison = compareText$1(right.createdAt, left.createdAt);
    if (createdComparison !== 0) {
      return createdComparison;
    }
    const idComparison = compareText$1(right.id, left.id);
    if (idComparison !== 0) {
      return idComparison;
    }
    return compareText$1(right.sourcePath, left.sourcePath);
  })[0]) != null ? _a : null;
}
function toApprovalState(task, approval) {
  var _a, _b, _c, _d, _e;
  const outcome = task.approval_outcome;
  return {
    status: outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : task.approval_needed ? "pending" : "not-needed",
    needed: task.approval_needed,
    outcome,
    requestedBy: (_a = approval == null ? void 0 : approval.requestedBy) != null ? _a : task.approval_requested_by,
    requestedAt: (_b = approval == null ? void 0 : approval.requestedAt) != null ? _b : null,
    decidedBy: (_c = approval == null ? void 0 : approval.decidedBy) != null ? _c : task.approved_by,
    decidedAt: (_d = approval == null ? void 0 : approval.decidedAt) != null ? _d : task.approved_at,
    reason: (_e = approval == null ? void 0 : approval.reason) != null ? _e : task.approval_reason
  };
}
function buildWorkspaceModel(document, projectIds, boardIds, columnIds, taskIds, approvalIds) {
  return {
    id: document.frontmatter.id,
    type: "workspace",
    name: document.frontmatter.name,
    ownerIds: sortStrings(document.frontmatter.owner_ids),
    memberIds: sortStrings(document.frontmatter.member_ids),
    projectIds,
    boardIds,
    columnIds,
    taskIds,
    approvalIds,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath
  };
}
function buildProjectModel(document, boardIds, columnIds, taskIds, approvalIds) {
  return {
    id: document.frontmatter.id,
    type: "project",
    workspaceId: document.frontmatter.workspace_id,
    name: document.frontmatter.name,
    boardIds,
    columnIds,
    taskIds,
    approvalIds,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath
  };
}
function buildBoardModel(document, columnIds, taskIds, approvalIds) {
  return {
    id: document.frontmatter.id,
    type: "board",
    workspaceId: document.frontmatter.workspace_id,
    projectId: document.frontmatter.project_id,
    name: document.frontmatter.name,
    columnIds,
    taskIds,
    approvalIds,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath
  };
}
function buildColumnModel(document, taskIds) {
  return {
    id: document.frontmatter.id,
    type: "column",
    workspaceId: document.frontmatter.workspace_id,
    projectId: document.frontmatter.project_id,
    boardId: document.frontmatter.board_id,
    name: document.frontmatter.name,
    position: document.frontmatter.position,
    taskIds,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath
  };
}
function buildApprovalModel(document) {
  return {
    id: document.frontmatter.id,
    type: "approval",
    workspaceId: document.frontmatter.workspace_id,
    projectId: document.frontmatter.project_id,
    boardId: document.frontmatter.board_id,
    taskId: document.frontmatter.task_id,
    status: document.frontmatter.status,
    outcome: document.frontmatter.outcome,
    requestedBy: document.frontmatter.requested_by,
    requestedAt: document.frontmatter.requested_at,
    decidedBy: document.frontmatter.decided_by,
    decidedAt: document.frontmatter.decided_at,
    reason: document.frontmatter.reason,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath
  };
}
function buildAuditNoteModel(document) {
  return {
    id: document.frontmatter.id,
    type: "audit-note",
    taskId: document.frontmatter.task_id,
    message: document.frontmatter.message,
    source: document.frontmatter.source,
    confidence: document.frontmatter.confidence,
    createdAt: document.frontmatter.created_at,
    sourcePath: document.sourcePath
  };
}
function buildAgentModel(document) {
  return {
    id: document.frontmatter.id,
    type: "agent",
    workspaceId: document.frontmatter.workspace_id,
    name: document.frontmatter.name,
    role: document.frontmatter.role,
    provider: document.frontmatter.provider,
    model: document.frontmatter.model,
    capabilities: sortStrings(document.frontmatter.capabilities),
    taskTypesAccepted: sortStrings(document.frontmatter.task_types_accepted),
    approvalRequiredFor: sortStrings(document.frontmatter.approval_required_for),
    cannotDo: sortStrings(document.frontmatter.cannot_do),
    accessibleBy: sortStrings(document.frontmatter.accessible_by),
    skillFile: document.frontmatter.skill_file,
    status: document.frontmatter.status,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath
  };
}
function buildTaskModel(document, approvals, now) {
  const latestApproval = getLatestApproval(approvals);
  const isStale = isTaskHeartbeatStale(document.frontmatter, now);
  return {
    id: document.frontmatter.id,
    type: "task",
    workspaceId: document.frontmatter.workspace_id,
    projectId: document.frontmatter.project_id,
    boardId: document.frontmatter.board_id,
    columnId: document.frontmatter.column,
    status: document.frontmatter.status,
    priority: document.frontmatter.priority,
    title: document.frontmatter.title,
    assignee: document.frontmatter.assignee,
    createdBy: document.frontmatter.created_by,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    heartbeatAt: document.frontmatter.heartbeat_at,
    executionStartedAt: document.frontmatter.execution_started_at,
    executionNotes: document.frontmatter.execution_notes,
    progress: document.frontmatter.progress,
    approvalNeeded: document.frontmatter.approval_needed,
    approvalRequestedBy: document.frontmatter.approval_requested_by,
    approvalReason: document.frontmatter.approval_reason,
    approvedBy: document.frontmatter.approved_by,
    approvedAt: document.frontmatter.approved_at,
    approvalOutcome: document.frontmatter.approval_outcome,
    blockedReason: document.frontmatter.blocked_reason,
    blockedSince: document.frontmatter.blocked_since,
    result: document.frontmatter.result,
    completedAt: document.frontmatter.completed_at,
    parentTaskId: document.frontmatter.parent_task_id,
    dependsOn: sortStrings(document.frontmatter.depends_on),
    tags: sortStrings(document.frontmatter.tags),
    links: readLinkArray(document.frontmatter),
    lockedBy: document.frontmatter.locked_by,
    lockedAt: document.frontmatter.locked_at,
    lockExpiresAt: document.frontmatter.lock_expires_at,
    isStale,
    approvalIds: sortStrings(approvals.map((approval) => approval.id)),
    approvalState: toApprovalState(document.frontmatter, latestApproval),
    body: document.body,
    sourcePath: document.sourcePath
  };
}
function collectIds(items) {
  return sortStrings(items.map((item) => item.id));
}
function collectGroupedIds(groups, key) {
  var _a;
  return collectIds((_a = groups.get(key)) != null ? _a : []);
}
function collectColumnIdsByPosition(items) {
  return [...items].sort((left, right) => {
    const positionComparison = left.position - right.position;
    if (positionComparison !== 0) {
      return positionComparison;
    }
    const idComparison = compareText$1(left.id, right.id);
    if (idComparison !== 0) {
      return idComparison;
    }
    return compareText$1(left.sourcePath, right.sourcePath);
  }).map((item) => item.id);
}
function buildVaultReadModel(collections, now = /* @__PURE__ */ new Date()) {
  const agents = sortById(collections.agents.map(buildAgentModel));
  const approvals = sortById(collections.approvals.map(buildApprovalModel));
  const auditNotes = sortById(collections.auditNotes.map(buildAuditNoteModel));
  const approvalsByTaskId = groupBy(approvals, (approval) => approval.taskId);
  const approvalsByBoardId = groupBy(approvals, (approval) => approval.boardId);
  const approvalsByProjectId = groupBy(approvals, (approval) => approval.projectId);
  const approvalsByWorkspaceId = groupBy(approvals, (approval) => approval.workspaceId);
  const tasks = sortById(
    collections.tasks.map((task) => {
      var _a;
      return buildTaskModel(task, (_a = approvalsByTaskId.get(task.frontmatter.id)) != null ? _a : [], now);
    })
  );
  const tasksByWorkspaceId = groupBy(tasks, (task) => task.workspaceId);
  const tasksByProjectId = groupBy(tasks, (task) => task.projectId);
  const tasksByBoardId = groupBy(tasks, (task) => task.boardId);
  const tasksByColumnId = groupBy(tasks, (task) => task.columnId);
  const columns = sortColumns(
    collections.columns.map(
      (column) => {
        var _a;
        return buildColumnModel(column, collectIds((_a = tasksByColumnId.get(column.frontmatter.id)) != null ? _a : []));
      }
    )
  );
  const columnsByWorkspaceId = groupBy(columns, (column) => column.workspaceId);
  const columnsByProjectId = groupBy(columns, (column) => column.projectId);
  const boards = sortById(
    collections.boards.map(
      (board) => {
        var _a;
        return buildBoardModel(
          board,
          collectColumnIdsByPosition(columns.filter((column) => column.boardId === board.frontmatter.id)),
          collectIds((_a = tasksByBoardId.get(board.frontmatter.id)) != null ? _a : []),
          collectGroupedIds(approvalsByBoardId, board.frontmatter.id)
        );
      }
    )
  );
  const boardsByWorkspaceId = groupBy(boards, (board) => board.workspaceId);
  const boardsByProjectId = groupBy(boards, (board) => board.projectId);
  const projects = sortById(
    collections.projects.map(
      (project) => {
        var _a, _b, _c;
        return buildProjectModel(
          project,
          collectIds((_a = boardsByProjectId.get(project.frontmatter.id)) != null ? _a : []),
          collectIds((_b = columnsByProjectId.get(project.frontmatter.id)) != null ? _b : []),
          collectIds((_c = tasksByProjectId.get(project.frontmatter.id)) != null ? _c : []),
          collectGroupedIds(approvalsByProjectId, project.frontmatter.id)
        );
      }
    )
  );
  const projectsByWorkspaceId = groupBy(projects, (project) => project.workspaceId);
  const workspaces = sortById(
    collections.workspaces.map(
      (workspace) => {
        var _a, _b, _c, _d;
        return buildWorkspaceModel(
          workspace,
          collectIds((_a = projectsByWorkspaceId.get(workspace.frontmatter.id)) != null ? _a : []),
          collectIds((_b = boardsByWorkspaceId.get(workspace.frontmatter.id)) != null ? _b : []),
          collectIds((_c = columnsByWorkspaceId.get(workspace.frontmatter.id)) != null ? _c : []),
          collectIds((_d = tasksByWorkspaceId.get(workspace.frontmatter.id)) != null ? _d : []),
          collectGroupedIds(approvalsByWorkspaceId, workspace.frontmatter.id)
        );
      }
    )
  );
  return {
    workspaces,
    projects,
    boards,
    columns,
    tasks,
    approvals,
    auditNotes,
    agents
  };
}

const VAULT_COLLECTION_DIRECTORIES = {
  workspaces: "vault/shared/workspaces",
  projects: "vault/shared/projects",
  boards: "vault/shared/boards",
  columns: "vault/shared/columns",
  tasks: "vault/shared/tasks",
  approvals: "vault/shared/approvals",
  auditNotes: "vault/shared/audit",
  agents: "vault/shared/agents"
};

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, key + "" , value);
class VaultReadError extends Error {
  constructor(message, filePath) {
    super(message);
    __publicField(this, "filePath");
    this.name = "VaultReadError";
    this.filePath = filePath;
  }
}
function isMissingFileError(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function compareText(left, right) {
  return left.localeCompare(right);
}
function parseDocumentValue(value, filePath) {
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
  if (trimmed.startsWith("[") && trimmed.endsWith("]") || trimmed.startsWith("{") && trimmed.endsWith("}") || trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw new VaultReadError(`Invalid frontmatter value: ${error.message}`, filePath);
    }
  }
  return trimmed;
}
function splitDocument(content, filePath) {
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
    body: lines.slice(closingFenceIndex + 1).join("\n")
  };
}
function parseFrontmatter(frontmatter, filePath) {
  const record = {};
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
function requireString(record, field, filePath) {
  const value = record[field];
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
}
function requireNullableString(record, field, filePath) {
  const value = record[field];
  if (value === null) {
    return null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
}
function requireBoolean(record, field, filePath) {
  const value = record[field];
  if (typeof value === "boolean") {
    return value;
  }
  throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
}
function requireStringArray(record, field, filePath) {
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
function requireTaskLinks(record, filePath) {
  const value = record.links;
  if (!Array.isArray(value)) {
    throw new VaultReadError("Missing or invalid links.", filePath);
  }
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new VaultReadError(`Missing or invalid links[${index}].`, filePath);
    }
    const project = requireString(item, "project", filePath);
    const thread = requireString(item, "thread", filePath);
    return { project, thread };
  });
}
function requireNullableTimestamp(record, field, filePath) {
  const value = record[field];
  if (value === null) {
    return null;
  }
  if (typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value))) {
    return value;
  }
  throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
}
function requireTimestamp(record, field, filePath) {
  const value = requireString(record, field, filePath);
  if (Number.isNaN(Date.parse(value))) {
    throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
  }
  return value;
}
function requireNumber(record, field, filePath) {
  const value = record[field];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
}
function requireApprovalOutcome(record, field, filePath) {
  const value = requireString(record, field, filePath);
  if (APPROVAL_OUTCOMES.includes(value)) {
    return value;
  }
  throw new VaultReadError(`Missing or invalid ${field}.`, filePath);
}
function requireExactType(record, expectedType, filePath) {
  const value = requireString(record, "type", filePath);
  if (value !== expectedType) {
    throw new VaultReadError(`Missing or invalid type. Expected ${expectedType}.`, filePath);
  }
}
function parseWorkspaceFrontmatter(record, filePath) {
  const frontmatter = {
    id: requireString(record, "id", filePath),
    type: "workspace",
    name: requireString(record, "name", filePath),
    owner_ids: [...requireStringArray(record, "owner_ids", filePath)].sort(compareText),
    member_ids: [...requireStringArray(record, "member_ids", filePath)].sort(compareText),
    created_at: requireTimestamp(record, "created_at", filePath),
    updated_at: requireTimestamp(record, "updated_at", filePath)
  };
  assertWorkspaceFrontmatter(frontmatter);
  return frontmatter;
}
function parseTaskFrontmatter(record, filePath) {
  const frontmatter = {
    id: requireString(record, "id", filePath),
    type: "task",
    version: requireNumber(record, "version", filePath),
    workspace_id: requireString(record, "workspace_id", filePath),
    project_id: requireString(record, "project_id", filePath),
    board_id: requireString(record, "board_id", filePath),
    column: requireString(record, "column", filePath),
    status: requireString(record, "status", filePath),
    priority: requireString(record, "priority", filePath),
    title: requireString(record, "title", filePath),
    assignee: requireString(record, "assignee", filePath),
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
    depends_on: [...requireStringArray(record, "depends_on", filePath)].sort(compareText),
    tags: [...requireStringArray(record, "tags", filePath)].sort(compareText),
    links: requireTaskLinks(record, filePath),
    locked_by: requireNullableString(record, "locked_by", filePath),
    locked_at: requireNullableTimestamp(record, "locked_at", filePath),
    lock_expires_at: requireNullableTimestamp(record, "lock_expires_at", filePath)
  };
  assertTaskFrontmatter(frontmatter);
  return frontmatter;
}
function parseProjectFrontmatter(record, filePath) {
  requireExactType(record, "project", filePath);
  return {
    id: requireString(record, "id", filePath),
    type: "project",
    workspace_id: requireString(record, "workspace_id", filePath),
    name: requireString(record, "name", filePath),
    created_at: requireTimestamp(record, "created_at", filePath),
    updated_at: requireTimestamp(record, "updated_at", filePath)
  };
}
function parseBoardFrontmatter(record, filePath) {
  requireExactType(record, "board", filePath);
  return {
    id: requireString(record, "id", filePath),
    type: "board",
    workspace_id: requireString(record, "workspace_id", filePath),
    project_id: requireString(record, "project_id", filePath),
    name: requireString(record, "name", filePath),
    created_at: requireTimestamp(record, "created_at", filePath),
    updated_at: requireTimestamp(record, "updated_at", filePath)
  };
}
function parseColumnFrontmatter(record, filePath) {
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
    updated_at: requireTimestamp(record, "updated_at", filePath)
  };
}
function parseApprovalFrontmatter(record, filePath) {
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
    updated_at: requireTimestamp(record, "updated_at", filePath)
  };
}
function parseAgentFrontmatter(record, filePath) {
  requireExactType(record, "agent", filePath);
  const frontmatter = {
    id: requireString(record, "id", filePath),
    type: "agent",
    name: requireString(record, "name", filePath),
    role: requireString(record, "role", filePath),
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
    updated_at: requireTimestamp(record, "updated_at", filePath)
  };
  assertAgentFrontmatter(frontmatter);
  return frontmatter;
}
function parseAuditNoteFrontmatter(record, filePath) {
  const frontmatter = {
    id: requireString(record, "id", filePath),
    type: "audit-note",
    task_id: requireString(record, "task_id", filePath),
    message: requireString(record, "message", filePath),
    source: requireString(record, "source", filePath),
    confidence: requireNumber(record, "confidence", filePath),
    created_at: requireTimestamp(record, "created_at", filePath)
  };
  assertAuditNoteFrontmatter(frontmatter);
  return frontmatter;
}
async function readVaultDocument(vaultRoot, filePath, parseFrontmatterRecord) {
  try {
    const content = await readFile(filePath, "utf8");
    const split = splitDocument(content, filePath);
    const frontmatterRecord = parseFrontmatter(split.frontmatter, filePath);
    const frontmatter = parseFrontmatterRecord(frontmatterRecord, filePath);
    return {
      sourcePath: relative(vaultRoot, filePath),
      body: split.body,
      frontmatter
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    if (error instanceof VaultReadError) {
      throw error;
    }
    throw new VaultReadError(error.message, filePath);
  }
}
async function readCollection(vaultRoot, collectionDirectory, parseFrontmatterRecord) {
  let entries = [];
  try {
    entries = await readdir(join(vaultRoot, collectionDirectory), { withFileTypes: true });
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw new VaultReadError(error.message, join(vaultRoot, collectionDirectory));
    }
  }
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => join(vaultRoot, collectionDirectory, entry.name)).sort(compareText);
  const documents = await Promise.all(files.map((filePath) => readVaultDocument(vaultRoot, filePath, parseFrontmatterRecord)));
  return documents.filter((document) => document !== null);
}
async function readSharedVaultCollections(vaultRoot) {
  return {
    workspaces: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.workspaces, parseWorkspaceFrontmatter),
    projects: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.projects, parseProjectFrontmatter),
    boards: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.boards, parseBoardFrontmatter),
    columns: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.columns, parseColumnFrontmatter),
    tasks: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.tasks, parseTaskFrontmatter),
    approvals: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.approvals, parseApprovalFrontmatter),
    auditNotes: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.auditNotes, parseAuditNoteFrontmatter),
    agents: await readCollection(vaultRoot, VAULT_COLLECTION_DIRECTORIES.agents, parseAgentFrontmatter)
  };
}
async function readCanonicalVaultReadModel(vaultRoot, now = /* @__PURE__ */ new Date()) {
  return buildVaultReadModel(await readSharedVaultCollections(vaultRoot), now);
}

export { readSharedVaultCollections as a, readCanonicalVaultReadModel as r };
//# sourceMappingURL=read.mjs.map
