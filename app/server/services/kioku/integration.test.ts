import { afterEach, describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../models/read-model";
import { searchKiokuCanonicalState } from "../../api/kioku/search.post";
import { createKiokuStorage } from "./storage";
import { syncReadModelToKioku } from "./sync";
import { readCanonicalVaultReadModel } from "../vault/read";
import { resolveVaultWorkspaceRoot } from "../vault/runtime";

function createFixtureReadModel(): VaultReadModel {
  return {
    workspaces: [],
    projects: [
      {
        id: "project-kioku",
        type: "project",
        workspaceId: "ws-demo",
        name: "Kioku Delivery",
        codebases: [],
        boardIds: ["board-kioku"],
        columnIds: ["todo"],
        taskIds: ["task-search"],
        approvalIds: ["approval-search"],
        createdAt: "2026-04-19T00:00:00Z",
        updatedAt: "2026-04-19T00:00:00Z",
        body: "project body should stay out",
        sourcePath: "vault/shared/projects/project-kioku.md",
      },
    ],
    boards: [
      {
        id: "board-kioku",
        type: "board",
        workspaceId: "ws-demo",
        projectId: "project-kioku",
        name: "Kioku Board",
        columnIds: ["todo"],
        taskIds: ["task-search"],
        approvalIds: ["approval-search"],
        createdAt: "2026-04-19T00:00:00Z",
        updatedAt: "2026-04-19T00:00:00Z",
        body: "board body should stay out",
        sourcePath: "vault/shared/boards/board-kioku.md",
      },
    ],
    columns: [],
    tasks: [
      {
        id: "task-search",
        type: "task",
        workspaceId: "ws-demo",
        projectId: "project-kioku",
        boardId: "board-kioku",
        columnId: "todo",
        status: "todo",
        priority: "critical",
        title: "Ship the Kioku search API",
        assignee: "agent-claude-code",
        createdBy: "@alice",
        createdAt: "2026-04-19T00:00:00Z",
        updatedAt: "2026-04-19T00:00:00Z",
        heartbeatAt: null,
        executionStartedAt: null,
        executionNotes: "secret execution details",
        progress: 0,
        approvalNeeded: true,
        approvalRequestedBy: "@alice",
        approvalReason: "sensitive approval reason",
        approvedBy: null,
        approvedAt: null,
        approvalOutcome: "pending",
        blockedReason: null,
        blockedSince: null,
        result: "sensitive result",
        completedAt: null,
        parentTaskId: null,
        dependsOn: [],
        tags: ["kioku", "search"],
        links: [],
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        isStale: false,
        approvalIds: ["approval-search"],
        approvalState: {
          status: "pending",
          needed: true,
          outcome: "pending",
          requestedBy: "@alice",
          requestedAt: "2026-04-19T00:00:00Z",
          decidedBy: null,
          decidedAt: null,
          reason: "sensitive approval reason",
        },
        body: "task body should stay out",
        sourcePath: "vault/shared/tasks/task-search.md",
      },
    ],
    approvals: [
      {
        id: "approval-search",
        type: "approval",
        workspaceId: "ws-demo",
        projectId: "project-kioku",
        boardId: "board-kioku",
        taskId: "task-search",
        status: "requested",
        outcome: "pending",
        requestedBy: "@alice",
        requestedAt: "2026-04-19T00:00:00Z",
        decidedBy: null,
        decidedAt: null,
        reason: "approval reason should stay out of hits",
        createdAt: "2026-04-19T00:00:00Z",
        updatedAt: "2026-04-19T00:00:00Z",
        body: "approval body should stay out",
        sourcePath: "vault/shared/approvals/approval-search.md",
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

describe("Kioku integration", () => {
  test("covers the full storage -> sync -> search -> canonical resolution path", async () => {
    const readModel = createFixtureReadModel();
    const storage = withStorage();

    const syncSummary = syncReadModelToKioku(readModel, storage);
    const result = await searchKiokuCanonicalState("kioku", { readModel, storage });

    expect(syncSummary.totalDocuments).toBe(4);
    expect(storage.count()).toBe(4);
    expect(result.query).toBe("kioku");
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.tasks.map((task) => task.id)).toContain("task-search");
    expect(result.projects.map((project) => project.id)).toContain("project-kioku");

    const payload = JSON.stringify(result);
    expect(payload).not.toContain("task body should stay out");
    expect(payload).not.toContain("secret execution details");
    expect(payload).not.toContain("sensitive approval reason");
  });

  test("sync is idempotent and search returns empty hits for misses", async () => {
    const readModel = createFixtureReadModel();
    const storage = withStorage();

    const first = syncReadModelToKioku(readModel, storage);
    const second = syncReadModelToKioku(readModel, storage);
    const result = await searchKiokuCanonicalState("nonexistent phrase", { readModel, storage });

    expect(first.totalDocuments).toBe(second.totalDocuments);
    expect(storage.count()).toBe(4);
    expect(result.hits).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.projects).toEqual([]);
    expect(result.boards).toEqual([]);
    expect(result.approvals).toEqual([]);
  });

  test("reads the real seeded vault, syncs it into Kioku, and returns task hits for a known keyword", async () => {
    const storage = withStorage();
    const readModel = await readCanonicalVaultReadModel(resolveVaultWorkspaceRoot());

    syncReadModelToKioku(readModel, storage);
    const hits = storage.search("regression");

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.entityType === "task")).toBe(true);
  });

  test("returns no hits for a keyword missing from the seeded vault", async () => {
    const storage = withStorage();
    const readModel = await readCanonicalVaultReadModel(resolveVaultWorkspaceRoot());

    syncReadModelToKioku(readModel, storage);
    const hits = storage.search("xyzzy_nonexistent_keyword");

    expect(hits).toEqual([]);
  });
});
