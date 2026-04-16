import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { s as syncTaskDocument } from './write.mjs';
import { r as resolveVaultWorkspaceRoot, a as resolveTaskFilePath } from './runtime.mjs';

const APPROVAL_FRONTMATTER_KEYS = [
  "id",
  "type",
  "workspace_id",
  "project_id",
  "board_id",
  "task_id",
  "status",
  "outcome",
  "requested_by",
  "requested_at",
  "decided_by",
  "decided_at",
  "reason",
  "created_at",
  "updated_at"
];
function stringifyValue(value) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return String(value);
}
function parseValue(value) {
  const trimmed = value.trim();
  if (trimmed === "null") {
    return null;
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }
  return trimmed;
}
function splitDocument(content) {
  const lines = content.split(/\r?\n/);
  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (lines[0] !== "---" || closingIndex === -1) {
    throw new Error("Approval document must include YAML frontmatter.");
  }
  return {
    frontmatter: lines.slice(1, closingIndex).join("\n"),
    body: lines.slice(closingIndex + 1).join("\n")
  };
}
function parseFrontmatter(frontmatter) {
  const record = {};
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
function serializeFrontmatter(frontmatter) {
  return APPROVAL_FRONTMATTER_KEYS.map((key) => `${String(key)}: ${stringifyValue(frontmatter[key])}`).join("\n");
}
function serializeApprovalDocument(frontmatter, body) {
  const bodySuffix = body.length === 0 ? "" : `
${body}`;
  return `---
${serializeFrontmatter(frontmatter)}
---${bodySuffix}`;
}
async function readApprovalDocument(filePath) {
  const content = await readFile(filePath, "utf8");
  const split = splitDocument(content);
  return {
    sourcePath: filePath,
    frontmatter: parseFrontmatter(split.frontmatter),
    body: split.body
  };
}
async function writeApprovalDocumentAtomic(filePath, document) {
  const directory = dirname(filePath);
  const tempFilePath = join(directory, `.${basename(filePath)}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(tempFilePath, serializeApprovalDocument(document.frontmatter, document.body), "utf8");
    await rename(tempFilePath, filePath);
  } finally {
    await rm(tempFilePath, { force: true }).catch(() => void 0);
  }
}
function compareDescending(left, right) {
  return right.localeCompare(left);
}
async function upsertLatestApprovalForTask(request) {
  var _a, _b, _c;
  const approvalsDir = join(request.vaultRoot, "vault", "shared", "approvals");
  await mkdir(approvalsDir, { recursive: true });
  const files = (await readdir(approvalsDir, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => join(approvalsDir, entry.name));
  const taskApprovals = await Promise.all(files.map(readApprovalDocument));
  const current = (_a = taskApprovals.filter((approval) => approval.frontmatter.task_id === request.taskId).sort(
    (left, right) => compareDescending(left.frontmatter.updated_at, right.frontmatter.updated_at) || compareDescending(left.frontmatter.created_at, right.frontmatter.created_at) || right.frontmatter.id.localeCompare(left.frontmatter.id)
  )[0]) != null ? _a : null;
  const nowIso = request.now.toISOString();
  const frontmatter = current === null ? {
    id: `approval-${randomUUID()}`,
    type: "approval",
    workspace_id: request.workspaceId,
    project_id: request.projectId,
    board_id: request.boardId,
    task_id: request.taskId,
    status: request.status,
    outcome: request.outcome,
    requested_by: request.actorId,
    requested_at: nowIso,
    decided_by: request.outcome === "pending" ? null : request.actorId,
    decided_at: request.outcome === "pending" ? null : nowIso,
    reason: request.reason,
    created_at: nowIso,
    updated_at: nowIso
  } : {
    ...current.frontmatter,
    workspace_id: request.workspaceId,
    project_id: request.projectId,
    board_id: request.boardId,
    task_id: request.taskId,
    status: request.status,
    outcome: request.outcome,
    requested_by: request.outcome === "pending" ? request.actorId : current.frontmatter.requested_by,
    requested_at: request.outcome === "pending" ? nowIso : current.frontmatter.requested_at,
    decided_by: request.outcome === "pending" ? null : request.actorId,
    decided_at: request.outcome === "pending" ? null : nowIso,
    reason: request.reason,
    updated_at: nowIso
  };
  const filePath = (_b = current == null ? void 0 : current.sourcePath) != null ? _b : join(approvalsDir, `${frontmatter.id}.md`);
  const body = (_c = current == null ? void 0 : current.body) != null ? _c : `# Approval ${frontmatter.id}
`;
  const document = {
    sourcePath: filePath,
    frontmatter,
    body
  };
  await writeApprovalDocumentAtomic(filePath, document);
  return document;
}

function withLifecycleDefaults(patch, current, now) {
  var _a;
  const next = { ...patch };
  if (next.status === "done" && next.completed_at === void 0) {
    return { ...next, completed_at: now.toISOString() };
  }
  if (next.status !== void 0 && next.status !== "done" && next.completed_at === void 0) {
    return { ...next, completed_at: null };
  }
  if (next.status === "blocked" && next.blocked_since === void 0) {
    return { ...next, blocked_since: now.toISOString() };
  }
  if (next.status !== void 0 && next.status !== "blocked" && next.blocked_since === void 0) {
    return {
      ...next,
      blocked_since: null,
      blocked_reason: (_a = next.blocked_reason) != null ? _a : null
    };
  }
  if (next.execution_started_at === void 0 && current.execution_started_at !== null && next.status === "in-progress") {
    return { ...next, execution_started_at: current.execution_started_at };
  }
  return next;
}
async function runTaskLifecycleMutation(request, mutate) {
  var _a, _b;
  const now = (_a = request.now) != null ? _a : /* @__PURE__ */ new Date();
  const vaultRoot = (_b = request.vaultRoot) != null ? _b : resolveVaultWorkspaceRoot();
  return await syncTaskDocument({
    filePath: resolveTaskFilePath(request.taskId, vaultRoot),
    actorId: request.actorId,
    now,
    mutate: (task) => withLifecycleDefaults(mutate(task, now), task, now)
  });
}
async function patchTaskLifecycle(request) {
  return await runTaskLifecycleMutation(request, () => request.patch);
}
async function claimTaskLifecycle(request) {
  return await runTaskLifecycleMutation(request, (_task, now) => {
    var _a;
    return {
      assignee: (_a = request.assignee) != null ? _a : request.actorId,
      status: "in-progress",
      column: "in-progress",
      execution_started_at: now.toISOString(),
      blocked_reason: null,
      blocked_since: null
    };
  });
}
async function heartbeatTaskLifecycle(request) {
  return await runTaskLifecycleMutation(request, () => ({}));
}
async function requestTaskApprovalLifecycle(request) {
  var _a, _b;
  const result = await runTaskLifecycleMutation(request, () => ({
    status: "waiting-approval",
    column: "review",
    approval_needed: true,
    approval_requested_by: request.actorId,
    approval_reason: request.reason,
    approval_outcome: "pending",
    approved_by: null,
    approved_at: null
  }));
  await upsertLatestApprovalForTask({
    vaultRoot: (_a = request.vaultRoot) != null ? _a : resolveVaultWorkspaceRoot(),
    taskId: result.frontmatter.id,
    workspaceId: result.frontmatter.workspace_id,
    projectId: result.frontmatter.project_id,
    boardId: result.frontmatter.board_id,
    actorId: request.actorId,
    reason: request.reason,
    outcome: "pending",
    status: "requested",
    now: (_b = request.now) != null ? _b : /* @__PURE__ */ new Date()
  });
  return result;
}
async function approveTaskLifecycle(request) {
  var _a, _b;
  const result = await runTaskLifecycleMutation(request, (_task, now) => ({
    status: "in-progress",
    column: "in-progress",
    approval_needed: true,
    approval_outcome: "approved",
    approved_by: request.actorId,
    approved_at: now.toISOString(),
    blocked_reason: null,
    blocked_since: null
  }));
  await upsertLatestApprovalForTask({
    vaultRoot: (_a = request.vaultRoot) != null ? _a : resolveVaultWorkspaceRoot(),
    taskId: result.frontmatter.id,
    workspaceId: result.frontmatter.workspace_id,
    projectId: result.frontmatter.project_id,
    boardId: result.frontmatter.board_id,
    actorId: request.actorId,
    reason: result.frontmatter.approval_reason,
    outcome: "approved",
    status: "approved",
    now: (_b = request.now) != null ? _b : /* @__PURE__ */ new Date()
  });
  return result;
}
async function rejectTaskLifecycle(request) {
  var _a, _b;
  const result = await runTaskLifecycleMutation(request, (_task, now) => ({
    status: "blocked",
    column: "review",
    approval_needed: true,
    approval_outcome: "rejected",
    approved_by: request.actorId,
    approved_at: now.toISOString(),
    blocked_reason: request.reason,
    blocked_since: now.toISOString()
  }));
  await upsertLatestApprovalForTask({
    vaultRoot: (_a = request.vaultRoot) != null ? _a : resolveVaultWorkspaceRoot(),
    taskId: result.frontmatter.id,
    workspaceId: result.frontmatter.workspace_id,
    projectId: result.frontmatter.project_id,
    boardId: result.frontmatter.board_id,
    actorId: request.actorId,
    reason: request.reason,
    outcome: "rejected",
    status: "rejected",
    now: (_b = request.now) != null ? _b : /* @__PURE__ */ new Date()
  });
  return result;
}

export { approveTaskLifecycle as a, requestTaskApprovalLifecycle as b, claimTaskLifecycle as c, heartbeatTaskLifecycle as h, patchTaskLifecycle as p, rejectTaskLifecycle as r };
//# sourceMappingURL=task-lifecycle.mjs.map
