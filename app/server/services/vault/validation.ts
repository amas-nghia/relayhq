import { VaultSchemaError, validateTaskFrontmatter, type TaskFrontmatter, type ValidationIssue, type ValidationResult } from "../../../shared/vault/schema";
import type { ProjectFrontmatter } from "./repository";
import { containsSecretMaterial } from "../security/secrets";

const TASK_IMMUTABLE_KEYS: ReadonlyArray<keyof TaskFrontmatter> = [
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
  "lock_expires_at",
] as const;

const TASK_MUTABLE_KEYS: ReadonlyArray<keyof TaskFrontmatter> = [
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
  "links",
] as const;

const PROJECT_IMMUTABLE_KEYS: ReadonlyArray<keyof ProjectFrontmatter> = ["id", "type", "workspace_id", "created_at", "updated_at"] as const;

const PROJECT_MUTABLE_KEYS: ReadonlyArray<keyof ProjectFrontmatter> = ["name", "codebase_root", "codebases"] as const;

export interface TaskWriteValidationInput {
  readonly current: TaskFrontmatter;
  readonly patch: unknown;
  readonly body: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushIssue(issues: ValidationIssue[], field: string, message: string): void {
  issues.push({ field, message });
}

function validateTaskPatchKeys(patch: Record<string, unknown>, issues: ValidationIssue[]): void {
  for (const key of Object.keys(patch)) {
    if ((TASK_IMMUTABLE_KEYS as ReadonlyArray<string>).includes(key)) {
      pushIssue(issues, key, "is immutable");
      continue;
    }

    if (!(TASK_MUTABLE_KEYS as ReadonlyArray<string>).includes(key)) {
      pushIssue(issues, key, "is not writable");
    }
  }
}

function validateProjectPatchKeys(patch: Record<string, unknown>, issues: ValidationIssue[]): void {
  for (const key of Object.keys(patch)) {
    if ((PROJECT_IMMUTABLE_KEYS as ReadonlyArray<string>).includes(key)) {
      pushIssue(issues, key, "is immutable");
      continue;
    }

    if (!(PROJECT_MUTABLE_KEYS as ReadonlyArray<string>).includes(key)) {
      pushIssue(issues, key, "is not writable");
    }
  }
}

function validateSecretExposure(record: Record<string, unknown>, body: string, issues: ValidationIssue[]): void {
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

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function validateProjectFrontmatter(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isPlainRecord(input)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }

  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    pushIssue(issues, "id", "must be a non-empty string");
  }

  if (input.type !== "project") {
    pushIssue(issues, "type", "must be project");
  }

  if (typeof input.workspace_id !== "string" || input.workspace_id.trim().length === 0) {
    pushIssue(issues, "workspace_id", "must be a non-empty string");
  }

  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    pushIssue(issues, "name", "must be a non-empty string");
  }

  if (input.codebase_root !== null && input.codebase_root !== undefined && (typeof input.codebase_root !== "string" || input.codebase_root.trim().length === 0)) {
    pushIssue(issues, "codebase_root", "must be a non-empty string or null");
  }

  const codebases = (input as Record<string, unknown>).codebases;
  if (codebases === undefined) {
    if (input.codebase_root === undefined) {
      pushIssue(issues, "codebases", "must be an array or use legacy codebase_root");
    }
  } else if (!Array.isArray(codebases)) {
    pushIssue(issues, "codebases", "must be an array");
  } else {
    codebases.forEach((entry, index) => {
      if (!isPlainRecord(entry)) {
        pushIssue(issues, `codebases[${index}]`, "must be an object");
        return;
      }
      if (typeof entry.name !== "string" || !/^[a-z0-9-]+$/.test(entry.name)) {
        pushIssue(issues, `codebases[${index}].name`, "must be a lowercase slug");
      }
      if (typeof entry.path !== "string" || entry.path.trim().length === 0) {
        pushIssue(issues, `codebases[${index}].path`, "must be a non-empty string");
      }
      if (entry.tech !== undefined && (typeof entry.tech !== "string" || entry.tech.trim().length === 0)) {
        pushIssue(issues, `codebases[${index}].tech`, "must be a non-empty string when provided");
      }
      if (entry.primary !== undefined && typeof entry.primary !== "boolean") {
        pushIssue(issues, `codebases[${index}].primary`, "must be a boolean when provided");
      }
    });
  }

  if (!isIsoTimestamp(input.created_at)) {
    pushIssue(issues, "created_at", "must be an ISO-8601 timestamp string");
  }

  if (!isIsoTimestamp(input.updated_at)) {
    pushIssue(issues, "updated_at", "must be an ISO-8601 timestamp string");
  }

  return { valid: issues.length === 0, issues };
}

export function validateTaskWrite(input: TaskWriteValidationInput): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isPlainRecord(input.patch)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }

  validateTaskPatchKeys(input.patch, issues);

  const candidate = {
    ...input.current,
    ...input.patch,
  };

  validateSecretExposure(candidate, input.body, issues);

  const schemaResult = validateTaskFrontmatter(candidate);
  issues.push(...schemaResult.issues);

  return { valid: issues.length === 0, issues };
}

export interface ProjectWriteValidationInput {
  readonly current: ProjectFrontmatter;
  readonly patch: unknown;
  readonly body: string;
}

export function validateProjectWrite(input: ProjectWriteValidationInput): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isPlainRecord(input.patch)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }

  validateProjectPatchKeys(input.patch, issues);

  const candidate = {
    ...input.current,
    ...input.patch,
    updated_at: input.current.updated_at,
  };

  validateSecretExposure(candidate, input.body, issues);

  const schemaResult = validateProjectFrontmatter(candidate);
  issues.push(...schemaResult.issues);

  return { valid: issues.length === 0, issues };
}

export function assertTaskWrite(input: TaskWriteValidationInput): asserts input is TaskWriteValidationInput {
  const result = validateTaskWrite(input);

  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}

export function assertProjectWrite(input: ProjectWriteValidationInput): asserts input is ProjectWriteValidationInput {
  const result = validateProjectWrite(input);

  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}
