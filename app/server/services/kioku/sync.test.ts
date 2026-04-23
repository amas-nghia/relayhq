import { afterEach, describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../models/read-model";
import { createKiokuStorage } from "./storage";
import { syncReadModelToKioku } from "./sync";

function createReadModel(): VaultReadModel {
  return {
    workspaces: [],
    projects: [
      {
        id: "project-demo",
        type: "project",
        workspaceId: "ws-demo",
        name: "RelayHQ Dev",
        codebases: [],
        boardIds: ["board-dev"],
        columnIds: ["todo"],
        taskIds: ["task-001"],
        approvalIds: ["approval-001"],
        createdAt: "2026-04-19T00:00:00Z",
        updatedAt: "2026-04-19T00:00:00Z",
        body: "project body with secret=redacted",
        sourcePath: "vault/shared/projects/project-demo.md",
      },
    ],
    boards: [
      {
        id: "board-dev",
        type: "board",
        workspaceId: "ws-demo",
        projectId: "project-demo",
        name: "Dev Board",
        columnIds: ["todo"],
        taskIds: ["task-001"],
        approvalIds: ["approval-001"],
        createdAt: "2026-04-19T00:00:00Z",
        updatedAt: "2026-04-19T00:00:00Z",
        body: "board body",
        sourcePath: "vault/shared/boards/board-dev.md",
      },
    ],
    columns: [],
    tasks: [
      {
        id: "task-001",
        type: "task",
        workspaceId: "ws-demo",
        projectId: "project-demo",
        boardId: "board-dev",
        columnId: "todo",
        status: "todo",
        priority: "high",
        title: "Ship Kioku sync",
        assignee: "agent-claude-code",
        createdBy: "@alice",
        createdAt: "2026-04-19T00:00:00Z",
        updatedAt: "2026-04-19T00:00:00Z",
        heartbeatAt: null,
        executionStartedAt: null,
        executionNotes: "do not leak",
        progress: 0,
        approvalNeeded: true,
        approvalRequestedBy: "@alice",
        approvalReason: "sensitive",
        approvedBy: null,
        approvedAt: null,
        approvalOutcome: "pending",
        blockedReason: null,
        blockedSince: null,
        result: "do not leak result",
        completedAt: null,
        parentTaskId: null,
        dependsOn: [],
        tags: ["kioku", "sync"],
        links: [],
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        isStale: false,
        approvalIds: ["approval-001"],
        approvalState: {
          status: "pending",
          needed: true,
          outcome: "pending",
          requestedBy: "@alice",
          requestedAt: "2026-04-19T00:00:00Z",
          decidedBy: null,
          decidedAt: null,
          reason: "sensitive",
        },
        body: "raw task body",
        sourcePath: "vault/shared/tasks/task-001.md",
      },
    ],
    approvals: [
      {
        id: "approval-001",
        type: "approval",
        workspaceId: "ws-demo",
        projectId: "project-demo",
        boardId: "board-dev",
        taskId: "task-001",
        status: "requested",
        outcome: "pending",
        requestedBy: "@alice",
        requestedAt: "2026-04-19T00:00:00Z",
        decidedBy: null,
        decidedAt: null,
        reason: "sensitive",
        createdAt: "2026-04-19T00:00:00Z",
        updatedAt: "2026-04-19T00:00:00Z",
        body: "approval body",
        sourcePath: "vault/shared/approvals/approval-001.md",
      },
    ],
    auditNotes: [],
    docs: [],
    agents: [],
  };
}

const storages: Array<ReturnType<typeof createKiokuStorage>> = [];

afterEach(() => {
  for (const storage of storages.splice(0)) {
    storage.close();
  }
});

function withStorage() {
  const storage = createKiokuStorage(":memory:");
  storages.push(storage);
  return storage;
}

describe("Kioku sync", () => {
  test("pushes all canonical entities into storage without leaking sensitive task fields", () => {
    const storage = withStorage();
    const summary = syncReadModelToKioku(createReadModel(), storage);

    expect(summary.totalDocuments).toBe(4);
    expect(storage.count()).toBe(4);

    const task = storage.fetchById("task-001");
    expect(task?.summary).toContain("Task Ship Kioku sync");
    expect(JSON.stringify(task)).not.toContain("do not leak");
    expect(JSON.stringify(task)).not.toContain("sensitive");
    expect(JSON.stringify(task)).not.toContain("raw task body");
  });

  test("is idempotent when run twice on the same read-model snapshot", () => {
    const storage = withStorage();
    const readModel = createReadModel();

    const first = syncReadModelToKioku(readModel, storage);
    const snapshot = storage.fetchById("task-001");
    const second = syncReadModelToKioku(readModel, storage);

    expect(first.totalDocuments).toBe(second.totalDocuments);
    expect(storage.count()).toBe(4);
    expect(storage.fetchById("task-001")).toEqual(snapshot);
  });

  test("removes stale documents that are no longer present in the read-model snapshot", () => {
    const storage = withStorage();
    const readModel = createReadModel();

    syncReadModelToKioku(readModel, storage);
    expect(storage.fetchById("task-001")).not.toBeNull();

    const emptySnapshot: VaultReadModel = {
      workspaces: [],
      projects: [],
      boards: [],
      columns: [],
      tasks: [],
      approvals: [],
      auditNotes: [],
      docs: [],
      agents: [],
    };

    const summary = syncReadModelToKioku(emptySnapshot, storage);

    expect(summary.deletedIds).toContain("task-001");
    expect(storage.count()).toBe(0);
  });

  test("preserves indexed code documents when syncing canonical vault state", () => {
    const storage = withStorage();
    storage.upsert({
      entityType: "document",
      entityId: "project-demo:src/index.ts",
      workspaceId: "ws-demo",
      projectId: "project-demo",
      boardId: null,
      taskId: null,
      title: "index.ts",
      summary: "index.ts - exports: demo",
      keywords: ["project-demo:src/index.ts", "src"],
      relations: [{ kind: "project", id: "project-demo" }],
      updatedAt: "2026-04-19T00:00:00Z",
      sourcePath: "src/index.ts",
      canonical: true,
    });

    syncReadModelToKioku(createReadModel(), storage);

    expect(storage.fetchById("project-demo:src/index.ts")?.entityType).toBe("document");
    expect(storage.count()).toBe(5);
  });
});
