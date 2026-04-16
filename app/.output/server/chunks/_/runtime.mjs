import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';

var __defProp$1 = Object.defineProperty;
var __defNormalProp$1 = (obj, key, value) => key in obj ? __defProp$1(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField$1 = (obj, key, value) => __defNormalProp$1(obj, key + "" , value);
const VAULT_SCHEMA_VERSION = 1;
const TASK_STATUSES = [
  "todo",
  "in-progress",
  "blocked",
  "waiting-approval",
  "done",
  "cancelled"
];
const TASK_COLUMNS = ["todo", "in-progress", "review", "done"];
const TASK_PRIORITIES = ["critical", "high", "medium", "low"];
const APPROVAL_OUTCOMES = ["approved", "rejected", "pending"];
class VaultSchemaError extends Error {
  constructor(issues) {
    super(`Vault schema validation failed: ${issues.map((issue) => `${issue.field}: ${issue.message}`).join(", ")}`);
    __publicField$1(this, "issues");
    this.name = "VaultSchemaError";
    this.issues = issues;
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function isInteger(value) {
  return isFiniteNumber(value) && Number.isInteger(value);
}
function isTimestamp(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}
function hasKey(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}
function isStringArray(value) {
  return Array.isArray(value) && value.every(isNonEmptyString);
}
function isNullableString(value) {
  return value === null || isNonEmptyString(value);
}
function pushIssue(issues, field, message) {
  issues.push({ field, message });
}
function requireField(record, field, issues) {
  if (!hasKey(record, field)) {
    pushIssue(issues, field, "required");
    return void 0;
  }
  return record[field];
}
function requireStringField(record, field, issues) {
  const value = requireField(record, field, issues);
  if (value === void 0) {
    return void 0;
  }
  if (!isNonEmptyString(value)) {
    pushIssue(issues, field, "must be a non-empty string");
    return void 0;
  }
  return value;
}
function requireNullableStringField(record, field, issues) {
  const value = requireField(record, field, issues);
  if (value === void 0) {
    return void 0;
  }
  if (!isNullableString(value)) {
    pushIssue(issues, field, "must be a non-empty string or null");
    return void 0;
  }
  return value;
}
function requireBooleanField(record, field, issues) {
  const value = requireField(record, field, issues);
  if (value === void 0) {
    return void 0;
  }
  if (typeof value !== "boolean") {
    pushIssue(issues, field, "must be a boolean");
    return void 0;
  }
  return value;
}
function requireIntegerField(record, field, issues) {
  const value = requireField(record, field, issues);
  if (value === void 0) {
    return void 0;
  }
  if (!isInteger(value)) {
    pushIssue(issues, field, "must be an integer");
    return void 0;
  }
  return value;
}
function requireRequiredTimestampField(record, field, issues) {
  const value = requireField(record, field, issues);
  if (value === void 0) {
    return void 0;
  }
  if (!isTimestamp(value)) {
    pushIssue(issues, field, "must be an ISO-8601 timestamp string");
    return void 0;
  }
  return value;
}
function requireNullableTimestampField(record, field, issues) {
  const value = requireField(record, field, issues);
  if (value === void 0) {
    return void 0;
  }
  if (value !== null && !isTimestamp(value)) {
    pushIssue(issues, field, "must be an ISO-8601 timestamp string or null");
    return void 0;
  }
  return value === null ? null : value;
}
function requireEnumField(record, field, allowedValues, issues) {
  const value = requireStringField(record, field, issues);
  if (value === void 0) {
    return void 0;
  }
  if (!allowedValues.includes(value)) {
    pushIssue(issues, field, `must be one of: ${allowedValues.join(", ")}`);
    return void 0;
  }
  return value;
}
function requireStringArrayField(record, field, issues) {
  const value = requireField(record, field, issues);
  if (value === void 0) {
    return void 0;
  }
  if (!Array.isArray(value)) {
    pushIssue(issues, field, "must be an array of strings");
    return void 0;
  }
  if (!isStringArray(value)) {
    pushIssue(issues, field, "must contain non-empty strings only");
    return void 0;
  }
  return value;
}
function validateTaskLink(value, index, issues) {
  if (!isRecord(value)) {
    pushIssue(issues, `links[${index}]`, "must be an object with project and thread fields");
    return false;
  }
  const project = value.project;
  const thread = value.thread;
  if (!isNonEmptyString(project)) {
    pushIssue(issues, `links[${index}].project`, "required");
    return false;
  }
  if (!isNonEmptyString(thread)) {
    pushIssue(issues, `links[${index}].thread`, "required");
    return false;
  }
  return true;
}
function validateTaskFrontmatter(input) {
  const issues = [];
  if (!isRecord(input)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }
  requireStringField(input, "id", issues);
  const type = requireStringField(input, "type", issues);
  if (type !== void 0 && type !== "task") {
    pushIssue(issues, "type", "must be task");
  }
  const version = requireIntegerField(input, "version", issues);
  if (version !== void 0 && version !== VAULT_SCHEMA_VERSION) {
    pushIssue(issues, "version", `must equal ${VAULT_SCHEMA_VERSION}`);
  }
  requireStringField(input, "workspace_id", issues);
  requireStringField(input, "project_id", issues);
  requireStringField(input, "board_id", issues);
  requireEnumField(input, "column", TASK_COLUMNS, issues);
  requireEnumField(input, "status", TASK_STATUSES, issues);
  requireEnumField(input, "priority", TASK_PRIORITIES, issues);
  requireStringField(input, "title", issues);
  requireStringField(input, "assignee", issues);
  requireStringField(input, "created_by", issues);
  requireRequiredTimestampField(input, "created_at", issues);
  requireRequiredTimestampField(input, "updated_at", issues);
  requireNullableTimestampField(input, "heartbeat_at", issues);
  requireNullableTimestampField(input, "execution_started_at", issues);
  requireNullableStringField(input, "execution_notes", issues);
  const progress = requireIntegerField(input, "progress", issues);
  if (progress !== void 0 && (progress < 0 || progress > 100)) {
    pushIssue(issues, "progress", "must be between 0 and 100");
  }
  requireBooleanField(input, "approval_needed", issues);
  requireNullableStringField(input, "approval_requested_by", issues);
  requireNullableStringField(input, "approval_reason", issues);
  requireNullableStringField(input, "approved_by", issues);
  requireNullableTimestampField(input, "approved_at", issues);
  requireEnumField(input, "approval_outcome", APPROVAL_OUTCOMES, issues);
  requireNullableStringField(input, "blocked_reason", issues);
  requireNullableTimestampField(input, "blocked_since", issues);
  requireNullableStringField(input, "result", issues);
  requireNullableTimestampField(input, "completed_at", issues);
  requireNullableStringField(input, "parent_task_id", issues);
  requireStringArrayField(input, "depends_on", issues);
  requireStringArrayField(input, "tags", issues);
  const links = requireField(input, "links", issues);
  if (links === void 0) {
    pushIssue(issues, "links", "required");
  } else if (!Array.isArray(links)) {
    pushIssue(issues, "links", "must be an array");
  } else {
    links.forEach((link, index) => {
      validateTaskLink(link, index, issues);
    });
  }
  requireNullableStringField(input, "locked_by", issues);
  requireNullableTimestampField(input, "locked_at", issues);
  requireNullableTimestampField(input, "lock_expires_at", issues);
  if (issues.length === 0) {
    const lockedAt = input.locked_at;
    const lockedBy = input.locked_by;
    const lockExpiresAt = input.lock_expires_at;
    if (lockedAt !== null && lockedAt !== void 0 && lockedBy === null) {
      pushIssue(issues, "locked_by", "required when locked_at is set");
    }
    if (lockedAt !== null && lockedAt !== void 0 && lockExpiresAt === null) {
      pushIssue(issues, "lock_expires_at", "required when locked_at is set");
    }
  }
  return { valid: issues.length === 0, issues };
}
function validateAgentFrontmatter(input) {
  const issues = [];
  if (!isRecord(input)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }
  requireStringField(input, "id", issues);
  const type = requireStringField(input, "type", issues);
  if (type !== void 0 && type !== "agent") {
    pushIssue(issues, "type", "must be agent");
  }
  requireStringField(input, "name", issues);
  requireStringField(input, "role", issues);
  requireStringField(input, "provider", issues);
  requireStringField(input, "model", issues);
  requireStringArrayField(input, "capabilities", issues);
  requireStringArrayField(input, "task_types_accepted", issues);
  requireStringArrayField(input, "approval_required_for", issues);
  requireStringArrayField(input, "cannot_do", issues);
  requireStringArrayField(input, "accessible_by", issues);
  requireStringField(input, "skill_file", issues);
  requireStringField(input, "status", issues);
  requireStringField(input, "workspace_id", issues);
  requireRequiredTimestampField(input, "created_at", issues);
  requireRequiredTimestampField(input, "updated_at", issues);
  return { valid: issues.length === 0, issues };
}
function validateWorkspaceFrontmatter(input) {
  const issues = [];
  if (!isRecord(input)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }
  requireStringField(input, "id", issues);
  const type = requireStringField(input, "type", issues);
  if (type !== void 0 && type !== "workspace") {
    pushIssue(issues, "type", "must be workspace");
  }
  requireStringField(input, "name", issues);
  requireStringArrayField(input, "owner_ids", issues);
  requireStringArrayField(input, "member_ids", issues);
  requireRequiredTimestampField(input, "created_at", issues);
  requireRequiredTimestampField(input, "updated_at", issues);
  return { valid: issues.length === 0, issues };
}
function validateAuditNoteFrontmatter(input) {
  const issues = [];
  if (!isRecord(input)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }
  requireStringField(input, "id", issues);
  const type = requireStringField(input, "type", issues);
  if (type !== void 0 && type !== "audit-note") {
    pushIssue(issues, "type", "must be audit-note");
  }
  requireStringField(input, "task_id", issues);
  requireStringField(input, "message", issues);
  requireStringField(input, "source", issues);
  const confidence = requireField(input, "confidence", issues);
  if (confidence === void 0) {
    pushIssue(issues, "confidence", "required");
  } else if (!isFiniteNumber(confidence) || confidence < 0 || confidence > 1) {
    pushIssue(issues, "confidence", "must be a number between 0 and 1");
  }
  requireRequiredTimestampField(input, "created_at", issues);
  return { valid: issues.length === 0, issues };
}
function assertTaskFrontmatter(input) {
  const result = validateTaskFrontmatter(input);
  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}
function assertAgentFrontmatter(input) {
  const result = validateAgentFrontmatter(input);
  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}
function assertWorkspaceFrontmatter(input) {
  const result = validateWorkspaceFrontmatter(input);
  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}
function assertAuditNoteFrontmatter(input) {
  const result = validateAuditNoteFrontmatter(input);
  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}

var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1e3;
const DEFAULT_STALE_AFTER_MS = 2 * DEFAULT_LOCK_TTL_MS;
const DEFAULT_TASK_HEARTBEAT_STALE_AFTER_MS = 24 * 60 * 60 * 1e3;
class VaultLockError extends Error {
  constructor(message, options) {
    super(message);
    __publicField(this, "actorId");
    __publicField(this, "owner");
    __publicField(this, "code");
    this.name = "VaultLockError";
    this.actorId = options.actorId;
    this.owner = options.owner;
    this.code = options.code;
  }
}
class VaultStaleWriteError extends VaultLockError {
  constructor(actorId, owner) {
    super("Task lock is stale and must be recovered before writing.", { actorId, owner, code: "stale" });
    this.name = "VaultStaleWriteError";
  }
}
function toIso(date) {
  return date.toISOString();
}
function addMilliseconds(date, milliseconds) {
  return new Date(date.getTime() + milliseconds);
}
function parseTimestamp(value) {
  if (value === null) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
function lockFilePath(filePath) {
  return `${filePath}.lock`;
}
function parseLockRecord(content) {
  const parsed = JSON.parse(content);
  if (typeof parsed.actor_id !== "string" || typeof parsed.heartbeat_at !== "string" || typeof parsed.lock_expires_at !== "string") {
    throw new Error("Invalid task lock record.");
  }
  return parsed;
}
function getLockRecordState(record, now, staleAfterMs) {
  const heartbeatAt = parseTimestamp(record.heartbeat_at);
  const lockExpiresAt = parseTimestamp(record.lock_expires_at);
  const staleByHeartbeat = heartbeatAt !== null && now.getTime() - heartbeatAt > staleAfterMs;
  const staleByExpiry = lockExpiresAt !== null && now.getTime() > lockExpiresAt;
  const stale = staleByHeartbeat || staleByExpiry;
  return {
    mode: stale ? "stale" : "contended",
    owner: record.actor_id,
    stale,
    staleReason: staleByHeartbeat ? "heartbeat" : staleByExpiry ? "lock-expired" : null,
    heartbeatAt: record.heartbeat_at,
    lockExpiresAt: record.lock_expires_at
  };
}
function getTaskLockState(task, now, staleAfterMs = DEFAULT_STALE_AFTER_MS) {
  const heartbeatAt = parseTimestamp(task.heartbeat_at);
  const lockExpiresAt = parseTimestamp(task.lock_expires_at);
  const owner = task.locked_by;
  const staleByHeartbeat = owner !== null && heartbeatAt !== null && now.getTime() - heartbeatAt > staleAfterMs;
  const staleByExpiry = owner !== null && lockExpiresAt !== null && now.getTime() > lockExpiresAt;
  const stale = staleByHeartbeat || staleByExpiry;
  const staleReason = staleByHeartbeat ? "heartbeat" : staleByExpiry ? "lock-expired" : null;
  if (owner === null) {
    return {
      mode: "unlocked",
      owner,
      stale: false,
      staleReason: null,
      heartbeatAt: task.heartbeat_at,
      lockExpiresAt: task.lock_expires_at
    };
  }
  if (stale) {
    return {
      mode: "stale",
      owner,
      stale: true,
      staleReason,
      heartbeatAt: task.heartbeat_at,
      lockExpiresAt: task.lock_expires_at
    };
  }
  return {
    mode: "owned",
    owner,
    stale: false,
    staleReason: null,
    heartbeatAt: task.heartbeat_at,
    lockExpiresAt: task.lock_expires_at
  };
}
function isTaskHeartbeatStale(task, now, staleAfterMs = DEFAULT_TASK_HEARTBEAT_STALE_AFTER_MS) {
  if (task.status === "done" || task.status === "cancelled") {
    return false;
  }
  const heartbeatAt = parseTimestamp(task.heartbeat_at);
  if (heartbeatAt === null) {
    return false;
  }
  return now.getTime() - heartbeatAt > staleAfterMs;
}
function assertTaskWriteable(task, actorId, now, staleAfterMs = DEFAULT_STALE_AFTER_MS) {
  const lockState = getTaskLockState(task, now, staleAfterMs);
  if (lockState.mode === "stale") {
    throw new VaultStaleWriteError(actorId, lockState.owner);
  }
  if (lockState.owner !== null && lockState.owner !== actorId) {
    throw new VaultLockError("Task is locked by another actor.", {
      actorId,
      owner: lockState.owner,
      code: "locked"
    });
  }
  return lockState;
}
function claimTaskLock(task, options) {
  const nowIso = toIso(options.now);
  const currentOwner = task.locked_by;
  return {
    ...task,
    locked_by: options.actorId,
    locked_at: currentOwner === options.actorId && task.locked_at !== null ? task.locked_at : nowIso,
    lock_expires_at: toIso(addMilliseconds(options.now, options.lockTtlMs)),
    heartbeat_at: nowIso
  };
}
async function acquireTaskFileLock(filePath, options) {
  const lockPath = lockFilePath(filePath);
  const record = {
    actor_id: options.actorId,
    heartbeat_at: toIso(options.now),
    lock_expires_at: toIso(addMilliseconds(options.now, options.lockTtlMs))
  };
  await mkdir(dirname(lockPath), { recursive: true });
  for (; ; ) {
    try {
      await writeFile(lockPath, JSON.stringify(record), { flag: "wx" });
      break;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : void 0;
      if (code !== "EEXIST") {
        throw error;
      }
      const current = parseLockRecord(await readFile(lockPath, "utf8"));
      const state = getLockRecordState(current, options.now, options.staleAfterMs);
      if (state.mode === "stale") {
        throw new VaultStaleWriteError(options.actorId, state.owner);
      }
      throw new VaultLockError("Task is locked by another actor.", {
        actorId: options.actorId,
        owner: state.owner,
        code: "locked"
      });
    }
  }
  return {
    lockPath,
    async release() {
      await unlink(lockPath).catch(() => void 0);
    }
  };
}

function resolveVaultWorkspaceRoot(cwd = process.cwd()) {
  if (process.env.RELAYHQ_VAULT_ROOT) {
    return process.env.RELAYHQ_VAULT_ROOT;
  }
  return basename(cwd) === "app" ? join(cwd, "..") : cwd;
}
function resolveTaskFilePath(taskId, vaultRoot = resolveVaultWorkspaceRoot()) {
  return join(vaultRoot, "vault", "shared", "tasks", `${taskId}.md`);
}

export { APPROVAL_OUTCOMES as A, DEFAULT_STALE_AFTER_MS as D, TASK_COLUMNS as T, VAULT_SCHEMA_VERSION as V, resolveTaskFilePath as a, TASK_PRIORITIES as b, VaultSchemaError as c, assertAgentFrontmatter as d, assertAuditNoteFrontmatter as e, assertTaskFrontmatter as f, assertWorkspaceFrontmatter as g, acquireTaskFileLock as h, isTaskHeartbeatStale as i, assertTaskWriteable as j, claimTaskLock as k, DEFAULT_LOCK_TTL_MS as l, resolveVaultWorkspaceRoot as r, validateTaskFrontmatter as v };
//# sourceMappingURL=runtime.mjs.map
