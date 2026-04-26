import { describe, expect, test } from "bun:test";

import { VAULT_SCHEMA_VERSION, type TaskFrontmatter } from "../../../shared/vault/schema";
import type { ProjectFrontmatter } from "./repository";
import { REDACTED_VALUE, containsSecretMaterial, redactSecrets } from "../security/secrets";
import { validateProjectWrite, validateTaskWrite } from "./validation";

function createTask(overrides: Partial<TaskFrontmatter> = {}): TaskFrontmatter {
  return {
    id: "task-001",
    type: "task",
    version: VAULT_SCHEMA_VERSION,
    workspace_id: "ws-acme",
    project_id: "project-auth",
    board_id: "board-auth-main",
    column: "todo",
    status: "todo",
    priority: "high",
    title: "Implement password reset API",
    assignee: "agent-backend-dev",
    created_by: "@alice",
    created_at: "2026-04-14T10:00:00Z",
    updated_at: "2026-04-14T10:00:00Z",
    heartbeat_at: null,
    execution_started_at: null,
    execution_notes: null,
    progress: 0,
    next_run_at: null,
    approval_needed: false,
    approval_requested_by: null,
    approval_reason: null,
    approved_by: null,
    approved_at: null,
    approval_outcome: "pending",
    blocked_reason: null,
    blocked_since: null,
    result: null,
    completed_at: null,
    parent_task_id: null,
    depends_on: [],
    tags: [],
    links: [],
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  };
}

function createProject(overrides: Partial<ProjectFrontmatter> = {}): ProjectFrontmatter {
  return {
    id: "project-auth",
    type: "project",
    workspace_id: "ws-acme",
    name: "Authentication",
    codebases: [{ name: "app", path: "/workspace/app", primary: true }],
    created_at: "2026-04-14T10:00:00Z",
    updated_at: "2026-04-14T10:00:00Z",
    ...overrides,
  };
}

describe("vault task write validation", () => {
  test("accepts a clean task update", () => {
    // Arrange
    const current = createTask();

    // Act
    const result = validateTaskWrite({
      current,
      patch: {
        status: "in-progress",
        progress: 25,
        next_run_at: "2026-04-14T12:00:00Z",
        execution_notes: "working through the implementation",
        cron_schedule: "0 9 * * 1-5",
      },
      body: "## Notes\nNo secrets here.",
    });

    // Assert
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test("rejects invalid cron schedules", () => {
    const current = createTask();

    const result = validateTaskWrite({
      current,
      patch: {
        cron_schedule: "not a cron",
      },
      body: "clean body",
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.field === "cron_schedule")).toBe(true);
  });

  test("rejects malformed or immutable task writes", () => {
    // Arrange
    const current = createTask();

    // Act
    const result = validateTaskWrite({
      current,
      patch: {
        id: "task-999",
        api_key: "sk-live-raw-secret",
      },
      body: "## Notes\nclean body",
    });

    // Assert
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.field === "id")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "api_key")).toBe(true);
  });

  test("rejects malformed patch shapes before merge", () => {
    // Arrange
    const current = createTask();

    // Act
    const nullPatch = validateTaskWrite({ current, patch: null, body: "clean" });
    const arrayPatch = validateTaskWrite({ current, patch: [], body: "clean" });

    // Assert
    expect(nullPatch.valid).toBe(false);
    expect(arrayPatch.valid).toBe(false);
    expect(nullPatch.issues.some((issue) => issue.field === "_self")).toBe(true);
    expect(arrayPatch.issues.some((issue) => issue.field === "_self")).toBe(true);
  });

  test("rejects secrets in other writable task fields", () => {
    // Arrange
    const current = createTask();

    // Act
    const result = validateTaskWrite({
      current,
      patch: {
        title: "Reset password with sk-live-1234567890abcdef",
        assignee: "Bearer abcdefghijklmnopqrstuvwxyz012345",
        result: "approved with secret sk-live-1234567890abcdef",
        blocked_reason: "blocked by password leak password=supersecret123",
        approval_reason: "access_token=abcdefghijklmnopqrstu123456",
      },
      body: "clean body",
    });

    // Assert
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.field === "_self")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "title")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "assignee")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "result")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "blocked_reason")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "approval_reason")).toBe(true);
  });

  test("rejects immutable lock-field mutation attempts", () => {
    // Arrange
    const current = createTask();

    // Act
    const result = validateTaskWrite({
      current,
      patch: {
        locked_by: "agent-malicious",
        locked_at: "2026-04-14T11:00:00Z",
        lock_expires_at: "2026-04-14T12:00:00Z",
        updated_at: "2026-04-14T11:00:00Z",
      },
      body: "clean body",
    });

    // Assert
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.field === "locked_by")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "locked_at")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "lock_expires_at")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "updated_at")).toBe(true);
  });

  test("rejects secret-bearing task content and redacts secret material", () => {
    // Arrange
    const current = createTask();

    // Act
    const result = validateTaskWrite({
      current,
      patch: {
        execution_notes: "use token sk-live-1234567890abcdef for debug",
      },
      body: "export const token = 'sk-live-1234567890abcdef';",
    });

    const sanitized = redactSecrets({
      body: "export const token = 'sk-live-1234567890abcdef';",
      nested: {
        apiKey: "Bearer abcdefghijklmnopqrstuvwxyz012345",
      },
    });

    // Assert
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.field === "execution_notes")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "body")).toBe(true);
    expect(containsSecretMaterial(sanitized)).toBe(false);
    expect(JSON.stringify(sanitized)).toContain(REDACTED_VALUE);
  });
});

describe("vault project write validation", () => {
  test("accepts a clean project update", () => {
    const current = createProject();

    const result = validateProjectWrite({
      current,
      patch: { name: "Identity Platform" },
      body: "# Project notes\nClean content.",
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test("rejects immutable fields, malformed patches, and secret-bearing project content", () => {
    const current = createProject();

    const invalidPatch = validateProjectWrite({
      current,
      patch: {
        id: "project-evil",
        workspace_id: "ws-other",
        name: "Bearer abcdefghijklmnopqrstuvwxyz012345",
      },
      body: "api_key=sk-live-1234567890abcdef",
    });

    const malformedPatch = validateProjectWrite({
      current,
      patch: null,
      body: "clean",
    });

    expect(invalidPatch.valid).toBe(false);
    expect(invalidPatch.issues.some((issue) => issue.field === "id")).toBe(true);
    expect(invalidPatch.issues.some((issue) => issue.field === "workspace_id")).toBe(true);
    expect(invalidPatch.issues.some((issue) => issue.field === "name")).toBe(true);
    expect(invalidPatch.issues.some((issue) => issue.field === "_self")).toBe(true);

    expect(malformedPatch.valid).toBe(false);
    expect(malformedPatch.issues.some((issue) => issue.field === "_self")).toBe(true);
  });
});
