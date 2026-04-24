import { describe, expect, test } from "bun:test";

import {
  VAULT_COLLECTION_DIRECTORIES,
  VAULT_COLLECTIONS_BY_RECORD_TYPE,
  VAULT_RECORD_TYPES,
  VAULT_RECORD_TYPES_BY_COLLECTION,
  getVaultCollectionName,
  getVaultRecordType,
} from "./repository";
import type { VaultIdentityMap } from "./repository";

const identities = {
  workspace: { type: "workspace", id: "ws-alpha" },
  project: { type: "project", id: "project-alpha", workspace_id: "ws-alpha" },
  board: { type: "board", id: "board-alpha", workspace_id: "ws-alpha", project_id: "project-alpha" },
  column: { type: "column", id: "column-alpha", workspace_id: "ws-alpha", project_id: "project-alpha", board_id: "board-alpha" },
  task: { type: "task", id: "task-alpha", workspace_id: "ws-alpha", project_id: "project-alpha", board_id: "board-alpha", column_id: "column-alpha" },
  issue: { type: "issue", id: "issue-alpha", workspace_id: "ws-alpha", project_id: "project-alpha" },
  doc: { type: "doc", id: "doc-alpha", workspace_id: "ws-alpha", project_id: null },
  approval: { type: "approval", id: "approval-alpha", workspace_id: "ws-alpha", project_id: "project-alpha", board_id: "board-alpha", task_id: "task-alpha" },
  auditNote: { type: "audit-note", id: "audit-alpha", task_id: "task-alpha" },
  agent: { type: "agent", id: "agent-alpha", workspace_id: "ws-alpha" },
} satisfies VaultIdentityMap;

describe("vault repository contracts", () => {
  test("keeps the canonical shared collection map in sync", () => {
    expect(Object.keys(VAULT_COLLECTION_DIRECTORIES)).toEqual(["workspaces", "projects", "boards", "columns", "tasks", "issues", "docs", "approvals", "auditNotes", "agents"]);
    expect(VAULT_RECORD_TYPES).toEqual(["workspace", "project", "board", "column", "task", "issue", "doc", "approval", "audit-note", "agent"]);
    expect(VAULT_RECORD_TYPES_BY_COLLECTION).toEqual({
      workspaces: "workspace",
      projects: "project",
      boards: "board",
      columns: "column",
      tasks: "task",
      issues: "issue",
      docs: "doc",
      approvals: "approval",
      auditNotes: "audit-note",
      agents: "agent",
    });
    expect(VAULT_COLLECTIONS_BY_RECORD_TYPE).toEqual({
      workspace: "workspaces",
      project: "projects",
      board: "boards",
      column: "columns",
      task: "tasks",
      issue: "issues",
      doc: "docs",
      approval: "approvals",
      "audit-note": "auditNotes",
      agent: "agents",
    });
  });

  test("round-trips record and collection names", () => {
    expect(getVaultRecordType("tasks")).toBe("task");
    expect(getVaultRecordType("docs")).toBe("doc");
    expect(getVaultCollectionName("approval")).toBe("approvals");
    expect(getVaultCollectionName("issue")).toBe("issues");
    expect(getVaultCollectionName("audit-note")).toBe("auditNotes");
    expect(getVaultCollectionName("agent")).toBe("agents");
  });

  test("models identity links through the shared contract", () => {
    expect(identities.task.column_id).toBe("column-alpha");
    expect(identities.issue.project_id).toBe("project-alpha");
    expect(identities.doc.workspace_id).toBe("ws-alpha");
    expect(identities.approval.task_id).toBe("task-alpha");
    expect(identities.auditNote.task_id).toBe("task-alpha");
    expect(identities.agent.workspace_id).toBe("ws-alpha");
  });
});
