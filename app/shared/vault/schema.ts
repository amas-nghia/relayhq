export const VAULT_SCHEMA_VERSION = 1 as const;

export const TASK_STATUSES = [
  "todo",
  "in-progress",
  "blocked",
  "waiting-approval",
  "done",
  "cancelled",
] as const;

export const TASK_COLUMNS = ["todo", "in-progress", "review", "done"] as const;

export const TASK_PRIORITIES = ["critical", "high", "medium", "low"] as const;

export const APPROVAL_OUTCOMES = ["approved", "rejected", "pending"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskColumn = (typeof TASK_COLUMNS)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type ApprovalOutcome = (typeof APPROVAL_OUTCOMES)[number];

export interface ValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<ValidationIssue>;
}

export class VaultSchemaError extends Error {
  public readonly issues: ReadonlyArray<ValidationIssue>;

  constructor(issues: ReadonlyArray<ValidationIssue>) {
    super(`Vault schema validation failed: ${issues.map((issue) => `${issue.field}: ${issue.message}`).join(", ")}`);
    this.name = "VaultSchemaError";
    this.issues = issues;
  }
}

export interface TaskLink {
  readonly project: string;
  readonly thread: string;
}

export interface TaskFrontmatter {
  readonly id: string;
  readonly type: "task";
  readonly version: typeof VAULT_SCHEMA_VERSION;
  readonly workspace_id: string;
  readonly project_id: string;
  readonly board_id: string;
  readonly column: TaskColumn;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly title: string;
  readonly assignee: string | null;
  readonly created_by: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly heartbeat_at: string | null;
  readonly execution_started_at: string | null;
  readonly execution_notes: string | null;
  readonly progress: number;
  readonly approval_needed: boolean;
  readonly approval_requested_by: string | null;
  readonly approval_reason: string | null;
  readonly approved_by: string | null;
  readonly approved_at: string | null;
  readonly approval_outcome: ApprovalOutcome;
  readonly blocked_reason: string | null;
  readonly blocked_since: string | null;
  readonly result: string | null;
  readonly completed_at: string | null;
  readonly parent_task_id: string | null;
  readonly source_issue_id?: string | null;
  readonly depends_on: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly links: ReadonlyArray<TaskLink>;
  readonly locked_by: string | null;
  readonly locked_at: string | null;
  readonly lock_expires_at: string | null;
}

export interface AgentFrontmatter {
  readonly id: string;
  readonly type: "agent";
  readonly name: string;
  readonly role: string;
  readonly provider: string;
  readonly model: string;
  readonly capabilities: ReadonlyArray<string>;
  readonly task_types_accepted: ReadonlyArray<string>;
  readonly approval_required_for: ReadonlyArray<string>;
  readonly cannot_do: ReadonlyArray<string>;
  readonly accessible_by: ReadonlyArray<string>;
  readonly skill_file: string;
  readonly status: string;
  readonly workspace_id: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ProviderOverlayRouting {
  readonly default_agent: string;
  readonly prefer_agents: ReadonlyArray<string>;
}

export interface ProviderOverlayToolPolicy {
  readonly allow_bash: boolean;
  readonly allow_file_write: boolean;
  readonly allow_network: boolean;
}

export interface ProviderOverlayPreferences {
  readonly language: string;
  readonly response_style: string;
  readonly auto_heartbeat: boolean;
  readonly heartbeat_interval_seconds: number;
}

export interface ProviderOverlayFrontmatter {
  readonly type: "provider-overlay";
  readonly user_id: string;
  readonly provider: string;
  readonly model: string;
  readonly api_key_ref: string;
  readonly routing: ProviderOverlayRouting;
  readonly tool_policy: ProviderOverlayToolPolicy;
  readonly preferences: ProviderOverlayPreferences;
  readonly updated_at: string;
}

export interface WorkspaceFrontmatter {
  readonly id: string;
  readonly type: "workspace";
  readonly name: string;
  readonly owner_ids: ReadonlyArray<string>;
  readonly member_ids: ReadonlyArray<string>;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ProjectCodebaseEntry {
  readonly name: string;
  readonly path: string;
  readonly tech?: string;
  readonly primary?: boolean;
}

export interface ProjectFrontmatter {
  readonly id: string;
  readonly type: "project";
  readonly workspace_id: string;
  readonly name: string;
  readonly codebase_root?: string | null;
  readonly codebases?: ReadonlyArray<ProjectCodebaseEntry>;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface AuditNoteFrontmatter {
  readonly id: string;
  readonly type: "audit-note";
  readonly task_id: string;
  readonly message: string;
  readonly source: string;
  readonly confidence: number;
  readonly created_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function hasKey(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isStringArray(value: unknown): value is ReadonlyArray<string> {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function pushIssue(issues: ValidationIssue[], field: string, message: string): void {
  issues.push({ field, message });
}

function requireField(record: Record<string, unknown>, field: string, issues: ValidationIssue[]): unknown {
  if (!hasKey(record, field)) {
    pushIssue(issues, field, "required");
    return undefined;
  }

  return record[field];
}

function requireStringField(record: Record<string, unknown>, field: string, issues: ValidationIssue[]): string | undefined {
  const value = requireField(record, field, issues);
  if (value === undefined) {
    return undefined;
  }

  if (!isNonEmptyString(value)) {
    pushIssue(issues, field, "must be a non-empty string");
    return undefined;
  }

  return value;
}

function requireNullableStringField(
  record: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): string | null | undefined {
  const value = requireField(record, field, issues);
  if (value === undefined) {
    return undefined;
  }

  if (!isNullableString(value)) {
    pushIssue(issues, field, "must be a non-empty string or null");
    return undefined;
  }

  return value;
}

function requireBooleanField(record: Record<string, unknown>, field: string, issues: ValidationIssue[]): boolean | undefined {
  const value = requireField(record, field, issues);
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    pushIssue(issues, field, "must be a boolean");
    return undefined;
  }

  return value;
}

function requireIntegerField(
  record: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): number | undefined {
  const value = requireField(record, field, issues);
  if (value === undefined) {
    return undefined;
  }

  if (!isInteger(value)) {
    pushIssue(issues, field, "must be an integer");
    return undefined;
  }

  return value;
}

function requireRequiredTimestampField(
  record: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): string | undefined {
  const value = requireField(record, field, issues);
  if (value === undefined) {
    return undefined;
  }

  if (!isTimestamp(value)) {
    pushIssue(issues, field, "must be an ISO-8601 timestamp string");
    return undefined;
  }

  return value;
}

function requireNullableTimestampField(
  record: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): string | null | undefined {
  const value = requireField(record, field, issues);
  if (value === undefined) {
    return undefined;
  }

  if (value !== null && !isTimestamp(value)) {
    pushIssue(issues, field, "must be an ISO-8601 timestamp string or null");
    return undefined;
  }

  return value === null ? null : value;
}

function requireEnumField<T extends string>(
  record: Record<string, unknown>,
  field: string,
  allowedValues: readonly T[],
  issues: ValidationIssue[],
): T | undefined {
  const value = requireStringField(record, field, issues);
  if (value === undefined) {
    return undefined;
  }

  if (!allowedValues.includes(value as T)) {
    pushIssue(issues, field, `must be one of: ${allowedValues.join(", ")}`);
    return undefined;
  }

  return value as T;
}

function requireStringArrayField(
  record: Record<string, unknown>,
  field: string,
  issues: ValidationIssue[],
): ReadonlyArray<string> | undefined {
  const value = requireField(record, field, issues);
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    pushIssue(issues, field, "must be an array of strings");
    return undefined;
  }

  if (!isStringArray(value)) {
    pushIssue(issues, field, "must contain non-empty strings only");
    return undefined;
  }

  return value;
}

function validateTaskLink(value: unknown, index: number, issues: ValidationIssue[]): value is TaskLink {
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

function isSecureKeyReference(value: unknown): boolean {
  return isNonEmptyString(value) && /^(env|secret|vault):[A-Z0-9_\-./]+$/i.test(value);
}

export function validateTaskFrontmatter(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }

  requireStringField(input, "id", issues);

  const type = requireStringField(input, "type", issues);
  if (type !== undefined && type !== "task") {
    pushIssue(issues, "type", "must be task");
  }

  const version = requireIntegerField(input, "version", issues);
  if (version !== undefined && version !== VAULT_SCHEMA_VERSION) {
    pushIssue(issues, "version", `must equal ${VAULT_SCHEMA_VERSION}`);
  }

  requireStringField(input, "workspace_id", issues);
  requireStringField(input, "project_id", issues);
  requireStringField(input, "board_id", issues);

  requireEnumField(input, "column", TASK_COLUMNS, issues);
  requireEnumField(input, "status", TASK_STATUSES, issues);
  requireEnumField(input, "priority", TASK_PRIORITIES, issues);

  requireStringField(input, "title", issues);
  requireNullableStringField(input, "assignee", issues);
  requireStringField(input, "created_by", issues);

  requireRequiredTimestampField(input, "created_at", issues);
  requireRequiredTimestampField(input, "updated_at", issues);

  requireNullableTimestampField(input, "heartbeat_at", issues);
  requireNullableTimestampField(input, "execution_started_at", issues);
  requireNullableStringField(input, "execution_notes", issues);

  const progress = requireIntegerField(input, "progress", issues);
  if (progress !== undefined && (progress < 0 || progress > 100)) {
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
  if (hasKey(input, "source_issue_id")) {
    requireNullableStringField(input, "source_issue_id", issues);
  }

  requireStringArrayField(input, "depends_on", issues);
  requireStringArrayField(input, "tags", issues);

  const links = requireField(input, "links", issues);
  if (links === undefined) {
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

    if (lockedAt !== null && lockedAt !== undefined && lockedBy === null) {
      pushIssue(issues, "locked_by", "required when locked_at is set");
    }

    if (lockedAt !== null && lockedAt !== undefined && lockExpiresAt === null) {
      pushIssue(issues, "lock_expires_at", "required when locked_at is set");
    }
  }

  return { valid: issues.length === 0, issues };
}

export function validateAgentFrontmatter(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }

  requireStringField(input, "id", issues);

  const type = requireStringField(input, "type", issues);
  if (type !== undefined && type !== "agent") {
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

export function validateProviderOverlayFrontmatter(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }

  const type = requireStringField(input, "type", issues);
  if (type !== undefined && type !== "provider-overlay") {
    pushIssue(issues, "type", "must be provider-overlay");
  }

  requireStringField(input, "user_id", issues);
  requireStringField(input, "provider", issues);
  requireStringField(input, "model", issues);

  const apiKeyRef = requireStringField(input, "api_key_ref", issues);
  if (apiKeyRef !== undefined && !isSecureKeyReference(apiKeyRef)) {
    pushIssue(issues, "api_key_ref", "must reference a secret by env:, secret:, or vault:");
  }

  const routing = requireField(input, "routing", issues);
  if (routing === undefined) {
    pushIssue(issues, "routing", "required");
  } else if (!isRecord(routing)) {
    pushIssue(issues, "routing", "must be an object");
  } else {
    requireStringField(routing, "default_agent", issues);
    requireStringArrayField(routing, "prefer_agents", issues);
  }

  const toolPolicy = requireField(input, "tool_policy", issues);
  if (toolPolicy === undefined) {
    pushIssue(issues, "tool_policy", "required");
  } else if (!isRecord(toolPolicy)) {
    pushIssue(issues, "tool_policy", "must be an object");
  } else {
    requireBooleanField(toolPolicy, "allow_bash", issues);
    requireBooleanField(toolPolicy, "allow_file_write", issues);
    requireBooleanField(toolPolicy, "allow_network", issues);
  }

  const preferences = requireField(input, "preferences", issues);
  if (preferences === undefined) {
    pushIssue(issues, "preferences", "required");
  } else if (!isRecord(preferences)) {
    pushIssue(issues, "preferences", "must be an object");
  } else {
    requireStringField(preferences, "language", issues);
    requireStringField(preferences, "response_style", issues);
    requireBooleanField(preferences, "auto_heartbeat", issues);
    const heartbeatIntervalSeconds = requireIntegerField(preferences, "heartbeat_interval_seconds", issues);
    if (heartbeatIntervalSeconds !== undefined && heartbeatIntervalSeconds <= 0) {
      pushIssue(issues, "preferences.heartbeat_interval_seconds", "must be greater than 0");
    }
  }

  requireRequiredTimestampField(input, "updated_at", issues);

  return { valid: issues.length === 0, issues };
}

export function validateWorkspaceFrontmatter(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }

  requireStringField(input, "id", issues);

  const type = requireStringField(input, "type", issues);
  if (type !== undefined && type !== "workspace") {
    pushIssue(issues, "type", "must be workspace");
  }

  requireStringField(input, "name", issues);
  requireStringArrayField(input, "owner_ids", issues);
  requireStringArrayField(input, "member_ids", issues);
  requireRequiredTimestampField(input, "created_at", issues);
  requireRequiredTimestampField(input, "updated_at", issues);

  return { valid: issues.length === 0, issues };
}

export function validateAuditNoteFrontmatter(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }

  requireStringField(input, "id", issues);

  const type = requireStringField(input, "type", issues);
  if (type !== undefined && type !== "audit-note") {
    pushIssue(issues, "type", "must be audit-note");
  }

  requireStringField(input, "task_id", issues);
  requireStringField(input, "message", issues);
  requireStringField(input, "source", issues);

  const confidence = requireField(input, "confidence", issues);
  if (confidence === undefined) {
    pushIssue(issues, "confidence", "required");
  } else if (!isFiniteNumber(confidence) || confidence < 0 || confidence > 1) {
    pushIssue(issues, "confidence", "must be a number between 0 and 1");
  }

  requireRequiredTimestampField(input, "created_at", issues);

  return { valid: issues.length === 0, issues };
}

export function assertTaskFrontmatter(input: unknown): asserts input is TaskFrontmatter {
  const result = validateTaskFrontmatter(input);
  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}

export function assertAgentFrontmatter(input: unknown): asserts input is AgentFrontmatter {
  const result = validateAgentFrontmatter(input);
  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}

export function assertProviderOverlayFrontmatter(input: unknown): asserts input is ProviderOverlayFrontmatter {
  const result = validateProviderOverlayFrontmatter(input);
  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}

export function assertWorkspaceFrontmatter(input: unknown): asserts input is WorkspaceFrontmatter {
  const result = validateWorkspaceFrontmatter(input);
  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}

export function assertAuditNoteFrontmatter(input: unknown): asserts input is AuditNoteFrontmatter {
  const result = validateAuditNoteFrontmatter(input);
  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}

export const ISSUE_STATUSES = ["open", "triaged", "investigating", "resolved", "closed", "wont-fix"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export interface IssueFrontmatter {
  readonly id: string;
  readonly type: "issue";
  readonly version: typeof VAULT_SCHEMA_VERSION;
  readonly workspace_id: string;
  readonly project_id: string;
  readonly status: IssueStatus;
  readonly priority: TaskPriority;
  readonly title: string;
  readonly reported_by: string;
  readonly discovered_during_task_id: string | null;
  readonly linked_task_ids: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly created_at: string;
  readonly updated_at: string;
}

export function validateIssueFrontmatter(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }

  requireStringField(input, "id", issues);

  const type = requireStringField(input, "type", issues);
  if (type !== undefined && type !== "issue") {
    pushIssue(issues, "type", "must be issue");
  }

  const version = requireIntegerField(input, "version", issues);
  if (version !== undefined && version !== VAULT_SCHEMA_VERSION) {
    pushIssue(issues, "version", `must equal ${VAULT_SCHEMA_VERSION}`);
  }

  requireStringField(input, "workspace_id", issues);
  requireStringField(input, "project_id", issues);
  requireEnumField(input, "status", ISSUE_STATUSES, issues);
  requireEnumField(input, "priority", TASK_PRIORITIES, issues);
  requireStringField(input, "title", issues);
  requireStringField(input, "reported_by", issues);
  requireNullableStringField(input, "discovered_during_task_id", issues);
  requireStringArrayField(input, "linked_task_ids", issues);
  requireStringArrayField(input, "tags", issues);
  requireRequiredTimestampField(input, "created_at", issues);
  requireRequiredTimestampField(input, "updated_at", issues);

  return { valid: issues.length === 0, issues };
}

export function assertIssueFrontmatter(input: unknown): asserts input is IssueFrontmatter {
  const result = validateIssueFrontmatter(input);
  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}

export const DOC_TYPES = ["feature-spec", "design", "adr", "runbook", "general", "feature", "decision", "research", "retro"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_STATUSES = ["draft", "active", "archived"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export interface DocFrontmatter {
  readonly id: string;
  readonly type: "doc";
  readonly doc_type: DocType;
  readonly workspace_id: string;
  readonly project_id?: string | null;
  readonly title: string;
  readonly status: DocStatus;
  readonly created_at: string;
  readonly updated_at: string;
  readonly tags: ReadonlyArray<string>;
}

export function validateDocFrontmatter(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    pushIssue(issues, "_self", "must be an object");
    return { valid: false, issues };
  }

  requireStringField(input, "id", issues);

  const type = requireStringField(input, "type", issues);
  if (type !== undefined && type !== "doc") {
    pushIssue(issues, "type", "must be doc");
  }

  requireEnumField(input, "doc_type", DOC_TYPES, issues);
  requireStringField(input, "workspace_id", issues);
  if (hasKey(input, "project_id")) {
    requireNullableStringField(input, "project_id", issues);
  }
  requireStringField(input, "title", issues);
  requireEnumField(input, "status", DOC_STATUSES, issues);
  requireRequiredTimestampField(input, "created_at", issues);
  requireRequiredTimestampField(input, "updated_at", issues);
  requireStringArrayField(input, "tags", issues);

  return { valid: issues.length === 0, issues };
}

export function assertDocFrontmatter(input: unknown): asserts input is DocFrontmatter {
  const result = validateDocFrontmatter(input);
  if (!result.valid) {
    throw new VaultSchemaError(result.issues);
  }
}
