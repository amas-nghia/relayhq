import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, rm, readFile } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { v as validateTaskFrontmatter, c as VaultSchemaError, f as assertTaskFrontmatter, h as acquireTaskFileLock, j as assertTaskWriteable, D as DEFAULT_STALE_AFTER_MS, k as claimTaskLock, l as DEFAULT_LOCK_TTL_MS } from './runtime.mjs';

const SECRET_VALUE_CHECK_PATTERNS = [
  /\b(?:sk|pk|rk|xox[baprs])-[A-Za-z0-9_-]{12,}\b/,
  /\bBearer\s+[A-Za-z0-9._\-+/=]{16,}\b/,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|secret|password)\b\s*[:=]\s*['"]?[^\s'"`]{8,}['"]?/i
];
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function containsSecretMaterial(value) {
  if (typeof value === "string") {
    return SECRET_VALUE_CHECK_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsSecretMaterial(item));
  }
  if (!isPlainObject(value)) {
    return false;
  }
  return Object.entries(value).some(([, nestedValue]) => containsSecretMaterial(nestedValue));
}

const TASK_IMMUTABLE_KEYS = [
  "id",
  "type",
  "version",
  "workspace_id",
  "project_id",
  "board_id",
  "created_by",
  "created_at",
  "updated_at",
  "heartbeat_at",
  "locked_by",
  "locked_at",
  "lock_expires_at"
];
const TASK_MUTABLE_KEYS = [
  "column",
  "status",
  "priority",
  "title",
  "assignee",
  "execution_started_at",
  "execution_notes",
  "progress",
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
  "parent_task_id",
  "depends_on",
  "tags",
  "links"
];
function isPlainRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function pushIssue(issues, field, message) {
  issues.push({ field, message });
}
function validateTaskPatchKeys(patch, issues) {
  for (const key of Object.keys(patch)) {
    if (TASK_IMMUTABLE_KEYS.includes(key)) {
      pushIssue(issues, key, "is immutable");
      continue;
    }
    if (!TASK_MUTABLE_KEYS.includes(key)) {
      pushIssue(issues, key, "is not writable");
    }
  }
}
function validateSecretExposure(record, body, issues) {
  let foundSecret = false;
  const bodyHasSecret = containsSecretMaterial(body);
  for (const [field, value] of Object.entries(record)) {
    if (containsSecretMaterial(value)) {
      pushIssue(issues, field, "must not contain raw secrets");
      foundSecret = true;
    }
  }
  if (bodyHasSecret) {
    pushIssue(issues, "body", "must not contain raw secrets");
    foundSecret = true;
  }
  if (foundSecret) {
    pushIssue(issues, "_self", "must not contain raw secrets");
  }
}
function validateTaskWrite(input) {
  const issues = [];
  if (!isPlainRecord(input.patch)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }
  validateTaskPatchKeys(input.patch, issues);
  const candidate = {
    ...input.current,
    ...input.patch
  };
  validateSecretExposure(candidate, input.body, issues);
  const schemaResult = validateTaskFrontmatter(candidate);
  issues.push(...schemaResult.issues);
  return { valid: issues.length === 0, issues };
}

const TASK_FRONTMATTER_KEYS = [
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
  "parent_task_id",
  "depends_on",
  "tags",
  "links",
  "locked_by",
  "locked_at",
  "lock_expires_at"
];
function toIso(date) {
  return date.toISOString();
}
function stringifyTaskValue(value) {
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
function parseTaskValue(value) {
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
  if (trimmed.startsWith("[") && trimmed.endsWith("]") || trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }
  return trimmed;
}
function splitDocument(content) {
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
    body: lines.slice(closingIndex + 1).join("\n")
  };
}
function parseTaskFrontmatter(frontmatter) {
  const record = {};
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
function parseTaskDocument(content) {
  const split = splitDocument(content);
  const frontmatter = parseTaskFrontmatter(split.frontmatter);
  assertTaskFrontmatter(frontmatter);
  return {
    frontmatter,
    body: split.body
  };
}
function serializeTaskLinks(links) {
  return JSON.stringify(links);
}
function serializeTaskFrontmatter(frontmatter) {
  return TASK_FRONTMATTER_KEYS.map((key) => {
    const value = key === "links" ? serializeTaskLinks(frontmatter.links) : stringifyTaskValue(frontmatter[key]);
    return `${String(key)}: ${value}`;
  }).join("\n");
}
function serializeTaskDocument(frontmatter, body) {
  const bodySuffix = body.length === 0 ? "" : `
${body}`;
  return `---
${serializeTaskFrontmatter(frontmatter)}
---${bodySuffix}`;
}
async function readTaskDocument(filePath) {
  const content = await readFile(filePath, "utf8");
  return {
    sourcePath: filePath,
    ...parseTaskDocument(content)
  };
}
async function writeTaskDocumentAtomic(filePath, document) {
  const directory = dirname(filePath);
  const tempFilePath = join(directory, `.${basename(filePath)}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(tempFilePath, serializeTaskDocument(document.frontmatter, document.body), "utf8");
    await rename(tempFilePath, filePath);
  } finally {
    await rm(tempFilePath, { force: true }).catch(() => void 0);
  }
}
function applyTaskPatch(base, patch, now, actorId, lockTtlMs) {
  return {
    ...base,
    ...patch,
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
    locked_by: actorId,
    locked_at: base.locked_by === actorId && base.locked_at !== null ? base.locked_at : toIso(now),
    lock_expires_at: toIso(new Date(now.getTime() + lockTtlMs))
  };
}
async function syncTaskDocument(request) {
  var _a, _b, _c;
  const now = (_a = request.now) != null ? _a : /* @__PURE__ */ new Date();
  const staleAfterMs = (_b = request.staleAfterMs) != null ? _b : DEFAULT_STALE_AFTER_MS;
  const lockTtlMs = (_c = request.lockTtlMs) != null ? _c : DEFAULT_LOCK_TTL_MS;
  const fileLock = await acquireTaskFileLock(request.filePath, {
    actorId: request.actorId,
    now,
    lockTtlMs,
    staleAfterMs
  });
  try {
    const current = await readTaskDocument(request.filePath);
    assertTaskWriteable(current.frontmatter, request.actorId, now, staleAfterMs);
    const leased = claimTaskLock(current.frontmatter, {
      actorId: request.actorId,
      now,
      lockTtlMs
    });
    const patch = request.mutate(leased);
    const validation = validateTaskWrite({
      current: leased,
      patch,
      body: current.body
    });
    if (!validation.valid) {
      throw new VaultSchemaError(validation.issues);
    }
    const next = applyTaskPatch(leased, patch, now, request.actorId, lockTtlMs);
    assertTaskFrontmatter(next);
    await writeTaskDocumentAtomic(request.filePath, { frontmatter: next, body: current.body });
    return {
      sourcePath: current.sourcePath,
      filePath: request.filePath,
      previous: current.frontmatter,
      frontmatter: next,
      body: current.body
    };
  } finally {
    await fileLock.release();
  }
}
async function createTaskDocument(request) {
  var _a;
  const body = (_a = request.body) != null ? _a : "";
  const validation = validateTaskWrite({
    current: request.frontmatter,
    patch: {},
    body
  });
  if (!validation.valid) {
    throw new VaultSchemaError(validation.issues);
  }
  assertTaskFrontmatter(request.frontmatter);
  await writeTaskDocumentAtomic(request.filePath, {
    frontmatter: request.frontmatter,
    body
  });
  return {
    sourcePath: request.filePath,
    filePath: request.filePath,
    frontmatter: request.frontmatter,
    body
  };
}

export { containsSecretMaterial as a, createTaskDocument as c, syncTaskDocument as s };
//# sourceMappingURL=write.mjs.map
