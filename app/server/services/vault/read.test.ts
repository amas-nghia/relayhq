import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { readCanonicalVaultReadModel } from "./read";

async function writeVaultDocument(root: string, relativePath: string, frontmatter: string, body = ""): Promise<void> {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\n${frontmatter}\n---${body.length > 0 ? `\n${body}` : ""}\n`, "utf8");
}

function expectNoPrivateOverlayLeak(model: unknown): void {
  const serialized = JSON.stringify(model);

  expect(serialized).not.toContain("vault/users/");
  expect(serialized).not.toContain("provider-overlay");
  expect(serialized).not.toContain("TEST_API_KEY");
}

describe("readCanonicalVaultReadModel", () => {
  test("reconstructs canonical state and ignores private overlays", async () => {
    const root = join(tmpdir(), `relayhq-read-${randomUUID()}`);

    try {
      await writeVaultDocument(
        root,
        "vault/shared/workspaces/ws-alpha.md",
        [
          "id: ws-alpha",
          "type: workspace",
          "name: Alpha Workspace",
          "owner_ids: [\"@bob\", \"@alice\"]",
          "member_ids: [\"@carol\", \"@alice\"]",
          "created_at: 2026-04-14T10:00:00Z",
          "updated_at: 2026-04-14T10:30:00Z",
        ].join("\n"),
        "# Workspace",
      );

      await writeVaultDocument(
        root,
        "vault/shared/projects/project-alpha.md",
        [
          "id: project-alpha",
          "type: project",
          "workspace_id: ws-alpha",
          "name: Alpha Project",
          "created_at: 2026-04-14T10:00:00Z",
          "updated_at: 2026-04-14T10:30:00Z",
        ].join("\n"),
        "# Project",
      );

      await writeVaultDocument(
        root,
        "vault/shared/boards/board-alpha.md",
        [
          "id: board-alpha",
          "type: board",
          "workspace_id: ws-alpha",
          "project_id: project-alpha",
          "name: Alpha Board",
          "created_at: 2026-04-14T10:00:00Z",
          "updated_at: 2026-04-14T10:30:00Z",
        ].join("\n"),
        "# Board",
      );

      await writeVaultDocument(
        root,
        "vault/shared/columns/todo.md",
        [
          "id: todo",
          "type: column",
          "workspace_id: ws-alpha",
          "project_id: project-alpha",
          "board_id: board-alpha",
          "name: Todo",
          "position: 20",
          "created_at: 2026-04-14T10:00:00Z",
          "updated_at: 2026-04-14T10:30:00Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/columns/review.md",
        [
          "id: review",
          "type: column",
          "workspace_id: ws-alpha",
          "project_id: project-alpha",
          "board_id: board-alpha",
          "name: Review",
          "position: 10",
          "created_at: 2026-04-14T10:00:00Z",
          "updated_at: 2026-04-14T10:30:00Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/tasks/task-001.md",
        [
          "id: task-001",
          "type: task",
          "version: 1",
          "workspace_id: ws-alpha",
          "project_id: project-alpha",
          "board_id: board-alpha",
          "column: todo",
          "status: waiting-approval",
          "priority: high",
          "title: Ship the canonical read model",
          "assignee: agent-backend-dev",
          "created_by: @alice",
          "created_at: 2026-04-14T10:00:00Z",
          "updated_at: 2026-04-14T10:30:00Z",
          "heartbeat_at: null",
          "execution_started_at: null",
          "execution_notes: null",
          "progress: 40",
          "approval_needed: true",
          "approval_requested_by: @alice",
          "approval_reason: Need human sign-off",
          "approved_by: null",
          "approved_at: null",
          "outcome: pending",
          "approval_outcome: pending",
          "blocked_reason: null",
          "blocked_since: null",
          "result: null",
          "completed_at: null",
          "parent_task_id: null",
          "depends_on: [\"task-000\"]",
          "tags: [\"read-model\", \"vault\"]",
          "links: [{\"project\":\"project-alpha\",\"thread\":\"thread-001\"}]",
          "locked_by: null",
          "locked_at: null",
          "lock_expires_at: null",
        ].join("\n"),
        "# Task",
      );

      await writeVaultDocument(
        root,
        "vault/shared/approvals/approval-001.md",
        [
          "id: approval-001",
          "type: approval",
          "workspace_id: ws-alpha",
          "project_id: project-alpha",
          "board_id: board-alpha",
          "task_id: task-001",
          "status: requested",
          "outcome: pending",
          "requested_by: @alice",
          "requested_at: 2026-04-14T10:05:00Z",
          "decided_by: null",
          "decided_at: null",
          "reason: Need human sign-off",
          "created_at: 2026-04-14T10:05:00Z",
          "updated_at: 2026-04-14T10:05:00Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/audit/audit-001.md",
        [
          "id: audit-001",
          "type: audit-note",
          "task_id: task-001",
          "message: Review decision captured for the release plan",
          "source: relayhq-ui",
          "confidence: 0.95",
          "created_at: 2026-04-14T10:06:00Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/agents/agent-backend-dev.md",
        [
          "id: agent-backend-dev",
          "type: agent",
          "name: Backend Developer",
          "role: backend-developer",
          "provider: claude",
          "model: claude-sonnet-4-6",
          "capabilities: [\"write-go-code\", \"ship-backend-features\"]",
          "task_types_accepted: [\"feature-implementation\", \"bug-fix\"]",
          "approval_required_for: [\"breaking-api-change\"]",
          "cannot_do: [\"frontend-design\"]",
          "accessible_by: [\"@alice\"]",
          "skill_file: skills/backend-developer.md",
          "status: available",
          "workspace_id: ws-alpha",
          "created_at: 2026-04-14T10:00:00Z",
          "updated_at: 2026-04-14T10:30:00Z",
        ].join("\n"),
        "# Agent",
      );

      await writeVaultDocument(
        root,
        "vault/users/alice/provider.md",
        [
          "type: provider-overlay",
          "user_id: @alice",
          "provider: claude",
          "model: claude-sonnet-4-6",
          "api_key_ref: env:TEST_API_KEY",
          "routing: {\"default_agent\":\"agent-backend-dev\",\"prefer_agents\":[\"agent-backend-dev\"]}",
          "tool_policy: {\"allow_bash\":true,\"allow_file_write\":true,\"allow_network\":false}",
          "preferences: {\"language\":\"en\",\"response_style\":\"concise\",\"auto_heartbeat\":true,\"heartbeat_interval_seconds\":300}",
          "updated_at: 2026-04-14T10:00:00Z",
        ].join("\n"),
      );

      const model = await readCanonicalVaultReadModel(root);

      expect(model.workspaces).toHaveLength(1);
      expect(model.projects).toHaveLength(1);
      expect(model.boards).toHaveLength(1);
      expect(model.columns).toHaveLength(2);
      expect(model.tasks).toHaveLength(1);
      expect(model.approvals).toHaveLength(1);
      expect(model.auditNotes).toHaveLength(1);
      expect(model.agents).toHaveLength(1);
      expect(model.workspaces[0].projectIds).toEqual(["project-alpha"]);
      expect(model.workspaces[0].boardIds).toEqual(["board-alpha"]);
      expect(model.workspaces[0].columnIds).toEqual(["review", "todo"]);
      expect(model.workspaces[0].taskIds).toEqual(["task-001"]);
      expect(model.workspaces[0].approvalIds).toEqual(["approval-001"]);
      expect(model.projects[0].boardIds).toEqual(["board-alpha"]);
      expect(model.projects[0].columnIds).toEqual(["review", "todo"]);
      expect(model.projects[0].taskIds).toEqual(["task-001"]);
      expect(model.projects[0].approvalIds).toEqual(["approval-001"]);
      expect(model.boards[0].columnIds).toEqual(["review", "todo"]);
      expect(model.boards[0].taskIds).toEqual(["task-001"]);
      expect(model.boards[0].approvalIds).toEqual(["approval-001"]);
      expect(model.columns.map((column) => column.taskIds)).toEqual([[], ["task-001"]]);
      expect(model.tasks[0].approvalIds).toEqual(["approval-001"]);
      expect(model.tasks[0].approvalState).toEqual({
        status: "pending",
        needed: true,
        outcome: "pending",
        requestedBy: "@alice",
        requestedAt: "2026-04-14T10:05:00Z",
        decidedBy: null,
        decidedAt: null,
        reason: "Need human sign-off",
      });
      expect(model.tasks[0].isStale).toBe(false);
      expect(model.tasks[0].links).toEqual([{ projectId: "project-alpha", threadId: "thread-001" }]);
      expect(model.auditNotes[0]).toEqual({
        id: "audit-001",
        type: "audit-note",
        taskId: "task-001",
        message: "Review decision captured for the release plan",
        source: "relayhq-ui",
        confidence: 0.95,
        createdAt: "2026-04-14T10:06:00Z",
        sourcePath: "vault/shared/audit/audit-001.md",
      });
      expect(model.agents[0]).toMatchObject({
        id: "agent-backend-dev",
        name: "Backend Developer",
        role: "backend-developer",
        status: "available",
        capabilities: ["ship-backend-features", "write-go-code"],
      });
      expectNoPrivateOverlayLeak(model);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("tolerates missing shared collection files", async () => {
    const root = join(tmpdir(), `relayhq-read-${randomUUID()}`);

    try {
      await writeVaultDocument(
        root,
        "vault/shared/workspaces/ws-beta.md",
        [
          "id: ws-beta",
          "type: workspace",
          "name: Beta Workspace",
          "owner_ids: [\"@alice\"]",
          "member_ids: [\"@alice\", \"@bob\"]",
          "created_at: 2026-04-14T11:00:00Z",
          "updated_at: 2026-04-14T11:30:00Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/audit/audit-002.md",
        [
          "id: audit-002",
          "type: audit-note",
          "task_id: task-002",
          "message: Missing shared files noted by reviewer",
          "source: relayhq-ui",
          "confidence: 0.8",
          "created_at: 2026-04-14T11:31:00Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/projects/project-beta.md",
        [
          "id: project-beta",
          "type: project",
          "workspace_id: ws-beta",
          "name: Beta Project",
          "created_at: 2026-04-14T11:00:00Z",
          "updated_at: 2026-04-14T11:30:00Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/boards/board-beta.md",
        [
          "id: board-beta",
          "type: board",
          "workspace_id: ws-beta",
          "project_id: project-beta",
          "name: Beta Board",
          "created_at: 2026-04-14T11:00:00Z",
          "updated_at: 2026-04-14T11:30:00Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/tasks/task-002.md",
        [
          "id: task-002",
          "type: task",
          "version: 1",
          "workspace_id: ws-beta",
          "project_id: project-beta",
          "board_id: board-beta",
          "column: review",
          "status: waiting-approval",
          "priority: medium",
          "title: Handle missing files",
          "assignee: agent-backend-dev",
          "created_by: @alice",
          "created_at: 2026-04-14T11:00:00Z",
          "updated_at: 2026-04-14T11:30:00Z",
          "heartbeat_at: null",
          "execution_started_at: null",
          "execution_notes: null",
          "progress: 0",
          "approval_needed: true",
          "approval_requested_by: @alice",
          "approval_reason: Waiting on missing files",
          "approved_by: null",
          "approved_at: null",
          "outcome: pending",
          "approval_outcome: pending",
          "blocked_reason: null",
          "blocked_since: null",
          "result: null",
          "completed_at: null",
          "parent_task_id: null",
          "depends_on: []",
          "tags: []",
          "links: []",
          "locked_by: null",
          "locked_at: null",
          "lock_expires_at: null",
        ].join("\n"),
      );

      const model = await readCanonicalVaultReadModel(root);

      expect(model.workspaces).toHaveLength(1);
      expect(model.projects).toHaveLength(1);
      expect(model.boards).toHaveLength(1);
      expect(model.columns).toHaveLength(0);
      expect(model.tasks).toHaveLength(1);
      expect(model.approvals).toHaveLength(0);
      expect(model.auditNotes).toHaveLength(1);
      expect(model.agents).toHaveLength(0);
      expect(model.boards[0].columnIds).toEqual([]);
      expect(model.tasks[0].approvalIds).toEqual([]);
      expect(model.tasks[0].approvalState).toEqual({
        status: "pending",
        needed: true,
        outcome: "pending",
        requestedBy: "@alice",
        requestedAt: null,
        decidedBy: null,
        decidedAt: null,
        reason: "Waiting on missing files",
      });
      expectNoPrivateOverlayLeak(model);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("marks only genuinely stale seeded tasks as stale in the read model", async () => {
    const root = join(tmpdir(), `relayhq-read-${randomUUID()}`);

    try {
      await writeVaultDocument(
        root,
        "vault/shared/workspaces/ws-demo.md",
        [
          "id: ws-demo",
          "type: workspace",
          "name: Demo Workspace",
          "owner_ids: [\"@alice\"]",
          "member_ids: [\"@alice\", \"agent-backend-dev\"]",
          "created_at: 2026-04-15T09:00:00Z",
          "updated_at: 2026-04-16T00:18:17.806Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/projects/project-demo.md",
        [
          "id: project-demo",
          "type: project",
          "workspace_id: ws-demo",
          "name: Demo Project",
          "created_at: 2026-04-15T09:00:00Z",
          "updated_at: 2026-04-16T00:18:17.806Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/boards/board-demo.md",
        [
          "id: board-demo",
          "type: board",
          "workspace_id: ws-demo",
          "project_id: project-demo",
          "name: Demo Board",
          "created_at: 2026-04-15T09:00:00Z",
          "updated_at: 2026-04-16T00:18:17.806Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/columns/in-progress.md",
        [
          "id: in-progress",
          "type: column",
          "workspace_id: ws-demo",
          "project_id: project-demo",
          "board_id: board-demo",
          "name: In Progress",
          "position: 10",
          "created_at: 2026-04-15T09:00:00Z",
          "updated_at: 2026-04-16T00:18:17.806Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/columns/review.md",
        [
          "id: review",
          "type: column",
          "workspace_id: ws-demo",
          "project_id: project-demo",
          "board_id: board-demo",
          "name: Review",
          "position: 20",
          "created_at: 2026-04-15T09:00:00Z",
          "updated_at: 2026-04-16T00:18:17.806Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/tasks/task-001.md",
        [
          "id: task-001",
          "type: task",
          "version: 1",
          "workspace_id: ws-demo",
          "project_id: project-demo",
          "board_id: board-demo",
          "column: in-progress",
          "status: in-progress",
          "priority: high",
          "title: Seed shared vault demo data",
          "assignee: agent-backend-dev",
          "created_by: @alice",
          "created_at: 2026-04-15T09:00:00Z",
          "updated_at: 2026-04-16T00:18:17.806Z",
          "heartbeat_at: 2026-04-16T00:18:17.806Z",
          "execution_started_at: null",
          "execution_notes: null",
          "progress: 0",
          "approval_needed: false",
          "approval_requested_by: null",
          "approval_reason: null",
          "approved_by: null",
          "approved_at: null",
          "approval_outcome: pending",
          "blocked_reason: null",
          "blocked_since: null",
          "result: null",
          "completed_at: null",
          "parent_task_id: null",
          "depends_on: []",
          "tags: [\"phase-1\"]",
          "links: [{\"project\":\"project-demo\",\"thread\":\"thread-phase-1\"}]",
          "locked_by: @alice",
          "locked_at: 2026-04-16T00:18:17.806Z",
          "lock_expires_at: 2026-04-16T00:23:17.806Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/tasks/task-002.md",
        [
          "id: task-002",
          "type: task",
          "version: 1",
          "workspace_id: ws-demo",
          "project_id: project-demo",
          "board_id: board-demo",
          "column: in-progress",
          "status: in-progress",
          "priority: critical",
          "title: Expose task lifecycle write APIs",
          "assignee: agent-backend-dev",
          "created_by: @alice",
          "created_at: 2026-04-15T09:00:00Z",
          "updated_at: 2026-04-15T09:30:00Z",
          "heartbeat_at: 2026-04-15T09:28:00Z",
          "execution_started_at: 2026-04-15T09:05:00Z",
          "execution_notes: Wiring PATCH and approval endpoints through the vault write flow.",
          "progress: 60",
          "approval_needed: false",
          "approval_requested_by: null",
          "approval_reason: null",
          "approved_by: null",
          "approved_at: null",
          "approval_outcome: pending",
          "blocked_reason: null",
          "blocked_since: null",
          "result: null",
          "completed_at: null",
          "parent_task_id: null",
          "depends_on: [\"task-001\"]",
          "tags: [\"phase-1\"]",
          "links: [{\"project\":\"project-demo\",\"thread\":\"thread-phase-1\"}]",
          "locked_by: agent-backend-dev",
          "locked_at: 2026-04-15T09:05:00Z",
          "lock_expires_at: 2026-04-15T09:35:00Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/tasks/task-003.md",
        [
          "id: task-003",
          "type: task",
          "version: 1",
          "workspace_id: ws-demo",
          "project_id: project-demo",
          "board_id: board-demo",
          "column: review",
          "status: waiting-approval",
          "priority: high",
          "title: Review navigation and approvals flow",
          "assignee: agent-backend-dev",
          "created_by: @alice",
          "created_at: 2026-04-15T09:00:00Z",
          "updated_at: 2026-04-15T09:30:00Z",
          "heartbeat_at: 2026-04-15T09:20:00Z",
          "execution_started_at: 2026-04-15T09:10:00Z",
          "execution_notes: Waiting on explicit human sign-off before the queue can move forward.",
          "progress: 85",
          "approval_needed: true",
          "approval_requested_by: agent-backend-dev",
          "approval_reason: Approve the release-facing navigation and approvals UX before closing the slice.",
          "approved_by: null",
          "approved_at: null",
          "approval_outcome: pending",
          "blocked_reason: null",
          "blocked_since: null",
          "result: null",
          "completed_at: null",
          "parent_task_id: null",
          "depends_on: [\"task-002\"]",
          "tags: [\"phase-1\"]",
          "links: [{\"project\":\"project-demo\",\"thread\":\"thread-phase-1\"}]",
          "locked_by: null",
          "locked_at: null",
          "lock_expires_at: null",
        ].join("\n"),
      );

      const model = await readCanonicalVaultReadModel(root, new Date("2026-04-16T09:24:00Z"));
      const staleByTaskId = Object.fromEntries(model.tasks.map((task) => [task.id, task.isStale]));

      expect(staleByTaskId).toEqual({
        "task-001": false,
        "task-002": false,
        "task-003": true,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("returns an empty canonical read model when shared collections are absent", async () => {
    const root = join(tmpdir(), `relayhq-read-${randomUUID()}`);

    try {
      const model = await readCanonicalVaultReadModel(root);

      expect(model).toEqual({
        workspaces: [],
        projects: [],
        boards: [],
        columns: [],
        tasks: [],
        issues: [],
        approvals: [],
        auditNotes: [],
        docs: [],
        agents: [],
      });
      expectNoPrivateOverlayLeak(model);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("returns deterministically ordered collections for UI consumption", async () => {
    const root = join(tmpdir(), `relayhq-read-${randomUUID()}`);

    try {
      const sharedDocs = [
        [
          "vault/shared/workspaces/ws-zeta.md",
          [
            "id: ws-zeta",
            "type: workspace",
            "name: Zeta Workspace",
            "owner_ids: [\"@zara\"]",
            "member_ids: [\"@zara\"]",
            "created_at: 2026-04-14T14:00:00Z",
            "updated_at: 2026-04-14T14:30:00Z",
          ].join("\n"),
        ],
        [
          "vault/shared/workspaces/ws-alpha.md",
          [
            "id: ws-alpha",
            "type: workspace",
            "name: Alpha Workspace",
            "owner_ids: [\"@alice\"]",
            "member_ids: [\"@alice\"]",
            "created_at: 2026-04-14T14:00:00Z",
            "updated_at: 2026-04-14T14:30:00Z",
          ].join("\n"),
        ],
        [
          "vault/shared/projects/project-zeta.md",
          [
            "id: project-zeta",
            "type: project",
            "workspace_id: ws-zeta",
            "name: Zeta Project",
            "created_at: 2026-04-14T14:00:00Z",
            "updated_at: 2026-04-14T14:30:00Z",
          ].join("\n"),
        ],
        [
          "vault/shared/projects/project-alpha.md",
          [
            "id: project-alpha",
            "type: project",
            "workspace_id: ws-alpha",
            "name: Alpha Project",
            "created_at: 2026-04-14T14:00:00Z",
            "updated_at: 2026-04-14T14:30:00Z",
          ].join("\n"),
        ],
        [
          "vault/shared/boards/board-zeta.md",
          [
            "id: board-zeta",
            "type: board",
            "workspace_id: ws-zeta",
            "project_id: project-zeta",
            "name: Zeta Board",
            "created_at: 2026-04-14T14:00:00Z",
            "updated_at: 2026-04-14T14:30:00Z",
          ].join("\n"),
        ],
        [
          "vault/shared/boards/board-alpha.md",
          [
            "id: board-alpha",
            "type: board",
            "workspace_id: ws-alpha",
            "project_id: project-alpha",
            "name: Alpha Board",
            "created_at: 2026-04-14T14:00:00Z",
            "updated_at: 2026-04-14T14:30:00Z",
          ].join("\n"),
        ],
        [
          "vault/shared/columns/column-zeta.md",
          [
            "id: todo",
            "type: column",
            "workspace_id: ws-zeta",
            "project_id: project-zeta",
            "board_id: board-zeta",
            "name: Zeta Column",
            "position: 20",
            "created_at: 2026-04-14T14:00:00Z",
            "updated_at: 2026-04-14T14:30:00Z",
          ].join("\n"),
        ],
        [
          "vault/shared/columns/column-alpha.md",
          [
            "id: review",
            "type: column",
            "workspace_id: ws-alpha",
            "project_id: project-alpha",
            "board_id: board-alpha",
            "name: Alpha Column",
            "position: 10",
            "created_at: 2026-04-14T14:00:00Z",
            "updated_at: 2026-04-14T14:30:00Z",
          ].join("\n"),
        ],
        [
          "vault/shared/tasks/task-zeta.md",
          [
            "id: task-zeta",
            "type: task",
            "version: 1",
            "workspace_id: ws-zeta",
            "project_id: project-zeta",
            "board_id: board-zeta",
            "column: todo",
            "status: todo",
            "priority: low",
            "title: Zeta Task",
            "assignee: agent-zeta",
            "created_by: @zara",
            "created_at: 2026-04-14T14:00:00Z",
            "updated_at: 2026-04-14T14:30:00Z",
            "heartbeat_at: null",
            "execution_started_at: null",
            "execution_notes: null",
            "progress: 0",
            "approval_needed: false",
            "approval_requested_by: null",
            "approval_reason: null",
            "approved_by: null",
            "approved_at: null",
            "outcome: pending",
            "approval_outcome: pending",
            "blocked_reason: null",
            "blocked_since: null",
            "result: null",
            "completed_at: null",
            "parent_task_id: null",
            "depends_on: []",
            "tags: []",
            "links: []",
            "locked_by: null",
            "locked_at: null",
            "lock_expires_at: null",
          ].join("\n"),
        ],
        [
          "vault/shared/tasks/task-alpha.md",
          [
            "id: task-alpha",
            "type: task",
            "version: 1",
            "workspace_id: ws-alpha",
            "project_id: project-alpha",
            "board_id: board-alpha",
            "column: review",
            "status: todo",
            "priority: low",
            "title: Alpha Task",
            "assignee: agent-alpha",
            "created_by: @alice",
            "created_at: 2026-04-14T14:00:00Z",
            "updated_at: 2026-04-14T14:30:00Z",
            "heartbeat_at: null",
            "execution_started_at: null",
            "execution_notes: null",
            "progress: 0",
            "approval_needed: true",
            "approval_requested_by: @alice",
            "approval_reason: Needs review",
            "approved_by: null",
            "approved_at: null",
            "outcome: pending",
            "approval_outcome: pending",
            "blocked_reason: null",
            "blocked_since: null",
            "result: null",
            "completed_at: null",
            "parent_task_id: null",
            "depends_on: []",
            "tags: []",
            "links: []",
            "locked_by: null",
            "locked_at: null",
            "lock_expires_at: null",
          ].join("\n"),
        ],
        [
          "vault/shared/approvals/approval-zeta.md",
          [
            "id: approval-zeta",
            "type: approval",
            "workspace_id: ws-zeta",
            "project_id: project-zeta",
            "board_id: board-zeta",
            "task_id: task-zeta",
            "status: requested",
            "outcome: pending",
            "requested_by: @zara",
            "requested_at: 2026-04-14T14:05:00Z",
            "decided_by: null",
            "decided_at: null",
            "reason: Zeta review",
            "created_at: 2026-04-14T14:05:00Z",
            "updated_at: 2026-04-14T14:05:00Z",
          ].join("\n"),
        ],
        [
          "vault/shared/approvals/approval-alpha.md",
          [
            "id: approval-alpha",
            "type: approval",
            "workspace_id: ws-alpha",
            "project_id: project-alpha",
            "board_id: board-alpha",
            "task_id: task-alpha",
            "status: requested",
            "outcome: pending",
            "requested_by: @alice",
            "requested_at: 2026-04-14T14:05:00Z",
            "decided_by: null",
            "decided_at: null",
            "reason: Alpha review",
            "created_at: 2026-04-14T14:05:00Z",
            "updated_at: 2026-04-14T14:05:00Z",
          ].join("\n"),
        ],
      ] as const;

      for (const [relativePath, frontmatter] of sharedDocs) {
        await writeVaultDocument(root, relativePath, frontmatter);
      }

      const model = await readCanonicalVaultReadModel(root);

      expect(model.workspaces.map((workspace) => workspace.id)).toEqual(["ws-alpha", "ws-zeta"]);
      expect(model.projects.map((project) => project.id)).toEqual(["project-alpha", "project-zeta"]);
      expect(model.boards.map((board) => board.id)).toEqual(["board-alpha", "board-zeta"]);
      expect(model.columns.map((column) => column.id)).toEqual(["review", "todo"]);
      expect(model.tasks.map((task) => task.id)).toEqual(["task-alpha", "task-zeta"]);
      expect(model.approvals.map((approval) => approval.id)).toEqual(["approval-alpha", "approval-zeta"]);
      expect(model.auditNotes).toEqual([]);
      expect(model.agents).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects malformed task links", async () => {
    const root = join(tmpdir(), `relayhq-read-${randomUUID()}`);

    try {
      await writeVaultDocument(
        root,
        "vault/shared/workspaces/ws-gamma.md",
        [
          "id: ws-gamma",
          "type: workspace",
          "name: Gamma Workspace",
          "owner_ids: [\"@alice\"]",
          "member_ids: [\"@alice\"]",
          "created_at: 2026-04-14T12:00:00Z",
          "updated_at: 2026-04-14T12:30:00Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/projects/project-gamma.md",
        [
          "id: project-gamma",
          "type: project",
          "workspace_id: ws-gamma",
          "name: Gamma Project",
          "created_at: 2026-04-14T12:00:00Z",
          "updated_at: 2026-04-14T12:30:00Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/boards/board-gamma.md",
        [
          "id: board-gamma",
          "type: board",
          "workspace_id: ws-gamma",
          "project_id: project-gamma",
          "name: Gamma Board",
          "created_at: 2026-04-14T12:00:00Z",
          "updated_at: 2026-04-14T12:30:00Z",
        ].join("\n"),
      );

      await writeVaultDocument(
        root,
        "vault/shared/tasks/task-003.md",
        [
          "id: task-003",
          "type: task",
          "version: 1",
          "workspace_id: ws-gamma",
          "project_id: project-gamma",
          "board_id: board-gamma",
          "column: todo",
          "status: todo",
          "priority: low",
          "title: Invalid links should fail",
          "assignee: agent-backend-dev",
          "created_by: @alice",
          "created_at: 2026-04-14T12:00:00Z",
          "updated_at: 2026-04-14T12:30:00Z",
          "heartbeat_at: null",
          "execution_started_at: null",
          "execution_notes: null",
          "progress: 0",
          "approval_needed: false",
          "approval_requested_by: null",
          "approval_reason: null",
          "approved_by: null",
          "approved_at: null",
          "outcome: pending",
          "approval_outcome: pending",
          "blocked_reason: null",
          "blocked_since: null",
          "result: null",
          "completed_at: null",
          "parent_task_id: null",
          "depends_on: []",
          "tags: []",
          "links: [{}]",
          "locked_by: null",
          "locked_at: null",
          "lock_expires_at: null",
        ].join("\n"),
      );

      await expect(readCanonicalVaultReadModel(root)).rejects.toThrow(/Missing or invalid (project|links)/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects malformed workspace arrays", async () => {
    const root = join(tmpdir(), `relayhq-read-${randomUUID()}`);

    try {
      await writeVaultDocument(
        root,
        "vault/shared/workspaces/ws-delta.md",
        [
          "id: ws-delta",
          "type: workspace",
          "name: Delta Workspace",
          "owner_ids: [1]",
          "member_ids: [\"@alice\"]",
          "created_at: 2026-04-14T13:00:00Z",
          "updated_at: 2026-04-14T13:30:00Z",
        ].join("\n"),
      );

      await expect(readCanonicalVaultReadModel(root)).rejects.toThrow(/Missing or invalid owner_ids\[0\]/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
