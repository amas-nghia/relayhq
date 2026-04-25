import { describe, expect, test } from "bun:test";

import {
  APPROVAL_OUTCOMES,
  TASK_COLUMNS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  VAULT_SCHEMA_VERSION,
  validateAgentFrontmatter,
  validateAuditNoteFrontmatter,
  validateProjectFrontmatter,
  validateProviderOverlayFrontmatter,
  validateTaskFrontmatter,
  validateWorkspaceFrontmatter,
} from "./schema";
import { canonicalVaultLayout, canonicalVaultPaths, getVaultOwnership } from "./layout";

describe("canonical vault layout", () => {
  test("lists the canonical shared, private, and system paths", () => {
    expect(canonicalVaultPaths()).toEqual([
      "vault/shared/workspaces/{workspace_id}.md",
      "vault/shared/projects/{project_id}.md",
      "vault/shared/boards/{board_id}.md",
      "vault/shared/columns/{column_id}.md",
      "vault/shared/tasks/{task_id}.md",
      "vault/shared/approvals/{approval_id}.md",
      "vault/shared/agents/{agent_id}.md",
      "vault/shared/audit/{audit_note_id}.md",
      "vault/shared/threads/{thread_id}.md",
      "vault/users/{user_id}/provider.md",
      "vault/users/{user_id}/prefs.md",
      "vault/users/{user_id}/scratch/",
      "vault/system/schemas/",
      "vault/system/templates/",
    ]);
  });

  test("separates ownership boundaries", () => {
    expect(getVaultOwnership("vault/shared/tasks/{task_id}.md")).toBe("shared");
    expect(getVaultOwnership("vault/users/{user_id}/provider.md")).toBe("private");
    expect(getVaultOwnership("vault/system/schemas/")).toBe("system");
  });

  test("exposes shared source-of-truth rules", () => {
    expect(canonicalVaultLayout.shared[0].ownership).toBe("shared");
    expect(canonicalVaultLayout.private[0].ownership).toBe("private");
    expect(canonicalVaultLayout.system[0].ownership).toBe("system");
  });
});

describe("task frontmatter validation", () => {
  test("accepts a valid task schema", () => {
    const result = validateTaskFrontmatter({
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
      source_issue_id: null,
      depends_on: [],
      tags: ["auth", "backend"],
      links: [{ project: "project-auth", thread: "thread-001" }],
      locked_by: null,
      locked_at: null,
      lock_expires_at: null,
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test("rejects invalid task enums and version mismatches", () => {
    const result = validateTaskFrontmatter({
      id: "task-001",
      type: "task",
      version: 2,
      workspace_id: "ws-acme",
      project_id: "project-auth",
      board_id: "board-auth-main",
      column: "",
      status: "broken",
      priority: "urgent",
      title: "Implement password reset API",
      assignee: "agent-backend-dev",
      created_by: "@alice",
      created_at: "2026-04-14T10:00:00Z",
      updated_at: "2026-04-14T10:00:00Z",
      heartbeat_at: null,
      execution_started_at: null,
      execution_notes: null,
      progress: 0,
      approval_needed: false,
      approval_requested_by: null,
      approval_reason: null,
      approved_by: null,
      approved_at: null,
      approval_outcome: "maybe",
      blocked_reason: null,
      blocked_since: null,
      result: null,
      completed_at: null,
      parent_task_id: null,
      source_issue_id: null,
      depends_on: [],
      tags: [],
      links: [],
      locked_by: null,
      locked_at: null,
      lock_expires_at: null,
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.field === "version")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "column")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "status")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "priority")).toBe(true);
    expect(result.issues.some((issue) => issue.field === "approval_outcome")).toBe(true);
  });
});

describe("other frontmatter validators", () => {
  test("accepts a valid agent schema", () => {
    expect(
      validateAgentFrontmatter({
        id: "agent-backend-dev",
        type: "agent",
        name: "Backend Developer",
        account_id: "claude-account-1",
        role: "implementation",
        roles: ["implementation"],
        provider: "claude",
        api_key_ref: "env:ANTHROPIC_API_KEY_ACCOUNT_1",
        model: "claude-sonnet-4-6",
        monthly_budget_usd: 25,
        capabilities: ["write-go-code"],
        task_types_accepted: ["feature-implementation"],
        approval_required_for: ["breaking-api-change"],
        cannot_do: ["frontend-code"],
        accessible_by: ["@alice"],
        skill_file: "skills/relayhq-backend-dev.md",
        status: "available",
        workspace_id: "ws-acme",
        created_at: "2026-04-14T10:00:00Z",
        updated_at: "2026-04-14T10:00:00Z",
      }).valid,
    ).toBe(true);
  });

  test("rejects an agent schema that exposes a raw api key", () => {
    const result = validateAgentFrontmatter({
      id: "agent-backend-dev",
      type: "agent",
      name: "Backend Developer",
      role: "implementation",
      roles: ["implementation"],
      provider: "claude",
      api_key_ref: "sk-live-raw-secret",
      model: "claude-sonnet-4-6",
      capabilities: ["write-go-code"],
      task_types_accepted: ["feature-implementation"],
      approval_required_for: ["breaking-api-change"],
      cannot_do: ["frontend-code"],
      accessible_by: ["@alice"],
      skill_file: "skills/relayhq-backend-dev.md",
      status: "available",
      workspace_id: "ws-acme",
      created_at: "2026-04-14T10:00:00Z",
      updated_at: "2026-04-14T10:00:00Z",
    })

    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.field === 'api_key_ref')).toBe(true)
  })

  test("rejects a provider overlay that exposes a raw key", () => {
    const result = validateProviderOverlayFrontmatter({
      type: "provider-overlay",
      user_id: "@alice",
      provider: "claude",
      model: "claude-sonnet-4-6",
      api_key_ref: "sk-live-raw-secret",
      routing: {
        default_agent: "agent-backend-dev",
        prefer_agents: ["agent-backend-dev"],
      },
      tool_policy: {
        allow_bash: true,
        allow_file_write: true,
        allow_network: false,
      },
      preferences: {
        language: "vi",
        response_style: "concise",
        auto_heartbeat: true,
        heartbeat_interval_seconds: 300,
      },
      updated_at: "2026-04-14T10:00:00Z",
    });

    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.field === "api_key_ref")).toBe(true);
  });

  test("accepts valid workspace and audit note schemas", () => {
    expect(
      validateWorkspaceFrontmatter({
        id: "ws-acme",
        type: "workspace",
        name: "Acme Corp",
        owner_ids: ["@alice"],
        member_ids: ["@alice", "@bob"],
        created_at: "2026-04-14T10:00:00Z",
        updated_at: "2026-04-14T10:00:00Z",
      }).valid,
    ).toBe(true);

    expect(
      validateAuditNoteFrontmatter({
        id: "audit-001",
        type: "audit-note",
        task_id: "task-001",
        message: "Approved deployment after review",
        source: "human",
        confidence: 1,
        created_at: "2026-04-14T10:00:00Z",
      }).valid,
    ).toBe(true);
  });

  test("accepts valid project schema extensions", () => {
    expect(
      validateProjectFrontmatter({
        id: "project-acme",
        type: "project",
        workspace_id: "ws-acme",
        name: "Acme Project",
        description: "Internal product delivery workspace",
        budget: "$12,000/mo",
        deadline: "2026-06-01T00:00:00Z",
        status: "active",
        links: [{ label: "PRD", url: "https://notion.so/prd" }],
        attachments: [{ label: "Kickoff doc", url: "https://drive.google.com/doc", type: "doc", addedAt: "2026-04-14T10:00:00Z" }],
        codebase_root: null,
        codebases: [{ name: "frontend", path: "/repo/frontend", primary: true }],
        created_at: "2026-04-14T10:00:00Z",
        updated_at: "2026-04-14T10:00:00Z",
      }).valid,
    ).toBe(true)
  })
});

describe("schema constants", () => {
  test("keeps the canonical enums stable", () => {
    expect(TASK_STATUSES).toContain("done");
    expect(TASK_COLUMNS).toContain("review");
    expect(TASK_PRIORITIES).toContain("critical");
    expect(APPROVAL_OUTCOMES).toContain("pending");
  });
});
