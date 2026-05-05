import { describe, expect, test } from "bun:test";

import type { VaultReadCollections } from "../services/vault/repository";
import { buildVaultReadModel } from "./read-model";

describe("buildVaultReadModel", () => {
  test("builds docs into the canonical read model", () => {
    const collections: VaultReadCollections = {
      workspaces: [],
      projects: [],
      boards: [],
      columns: [],
      tasks: [],
      issues: [],
      docs: [
        {
          sourcePath: "vault/shared/docs/feature-vault-docs.md",
          body: "# Vault docs support",
          frontmatter: {
            id: "feature-vault-docs",
            type: "doc",
            doc_type: "feature-spec",
            workspace_id: "ws-alpha",
            project_id: "project-alpha",
            title: "Vault docs support",
            status: "draft",
            visibility: "project",
            access_roles: ["all"],
            sensitive: false,
            created_at: "2026-04-23T10:00:00Z",
            updated_at: "2026-04-23T10:05:00Z",
            tags: ["vault", "docs"],
          },
        },
      ],
      approvals: [],
      auditNotes: [],
      agents: [],
      coordinatorThreads: [],
    };

    const model = buildVaultReadModel(collections);

    expect(model.docs).toEqual([
      {
        id: "feature-vault-docs",
        type: "doc",
        docType: "feature-spec",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        title: "Vault docs support",
        status: "draft",
        visibility: "project",
        accessRoles: ["all"],
        sensitive: false,
        createdAt: "2026-04-23T10:00:00Z",
        updatedAt: "2026-04-23T10:05:00Z",
        tags: ["docs", "vault"],
        body: "# Vault docs support",
        sourcePath: "vault/shared/docs/feature-vault-docs.md",
      },
    ]);
  });

  test("includes active task session metadata on tasks", () => {
    const collections: VaultReadCollections = {
      workspaces: [],
      projects: [],
      boards: [],
      columns: [],
      tasks: [
        {
          sourcePath: "vault/shared/tasks/task-1.md",
          body: "Task body",
          frontmatter: {
            id: "task-1",
            type: "task",
            version: 1,
            workspace_id: "ws-alpha",
            project_id: "project-alpha",
            board_id: "board-alpha",
            column: "todo",
            status: "todo",
            priority: "high",
            title: "Task one",
            assignee: "agent-1",
            created_by: "@owner",
            created_at: "2026-04-23T10:00:00Z",
            updated_at: "2026-04-23T10:05:00Z",
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
            depends_on: [],
            tags: [],
            links: [],
            locked_by: null,
            locked_at: null,
            lock_expires_at: null,
          },
        } as never,
      ],
      issues: [],
      docs: [],
      approvals: [],
      auditNotes: [],
      agents: [],
      coordinatorThreads: [],
    }

    const model = buildVaultReadModel(
      collections,
      new Date("2026-04-23T10:06:00Z"),
      new Map([["task-1", { sessionId: "session-1", status: "active" as const }]]),
    )

    expect(model.tasks[0]).toMatchObject({
      id: "task-1",
      activeSessionId: "session-1",
      activeSessionStatus: "active",
    })
  })
});
