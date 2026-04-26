import { describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../models/read-model";
import { buildKiokuIndexUpdates } from "./indexer";
import { resolveKiokuRetrieval, retrieveKiokuCanonicalState, type KiokuSearchClient, type KiokuSearchHit } from "./retriever";

function createReadModel(): VaultReadModel {
  return {
    workspaces: [],
    projects: [
      {
        id: "project-alpha",
        type: "project",
        workspaceId: "ws-alpha",
        name: "Alpha Project",
        boardIds: ["board-alpha"],
        columnIds: ["column-alpha"],
        taskIds: ["task-alpha"],
        approvalIds: ["approval-alpha"],
        createdAt: "2026-04-14T10:00:00Z",
        updatedAt: "2026-04-14T10:30:00Z",
        body: "## classified project body\ncredential=redacted",
        sourcePath: "vault/shared/projects/project-alpha.md",
        attachments: [{ label: "Kickoff doc", url: "https://example.com/kickoff", type: "doc", addedAt: "2026-04-14T10:05:00Z" }],
        codebases: [],
      },
    ],
    boards: [
      {
        id: "board-alpha",
        type: "board",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        name: "Alpha Board",
        columnIds: ["column-alpha"],
        taskIds: ["task-alpha"],
        approvalIds: ["approval-alpha"],
        createdAt: "2026-04-14T10:00:00Z",
        updatedAt: "2026-04-14T10:30:00Z",
        body: "board notes with token=redacted",
        sourcePath: "vault/shared/boards/board-alpha.md",
      },
    ],
    columns: [],
    tasks: [
      {
        id: "task-alpha",
        type: "task",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        boardId: "board-alpha",
        columnId: "column-alpha",
        status: "in-progress",
        priority: "high",
        title: "Ship Kioku bridge",
        assignee: "agent-backend-dev",
        createdBy: "@alice",
        createdAt: "2026-04-14T10:00:00Z",
        updatedAt: "2026-04-14T10:30:00Z",
        heartbeatAt: null,
        executionStartedAt: null,
        executionNotes: "do not index this internal note",
        progress: 70,
        approvalNeeded: true,
        approvalRequestedBy: "@alice",
        approvalReason: "needs restricted access",
        approvedBy: null,
        approvedAt: null,
        approvalOutcome: "pending",
        blockedReason: null,
        blockedSince: null,
        result: "this result should not appear",
        completedAt: null,
        parentTaskId: null,
        dependsOn: ["task-upstream"],
        tags: ["kioku", "bridge"],
        links: [{ projectId: "project-alpha", threadId: "thread-alpha" }],
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        approvalIds: ["approval-alpha"],
        approvalState: {
          status: "pending",
          needed: true,
          outcome: "pending",
          requestedBy: "@alice",
          requestedAt: "2026-04-14T10:10:00Z",
          decidedBy: null,
          decidedAt: null,
        reason: "needs restricted access",
        },
        body: "task body with raw token=redacted",
        sourcePath: "vault/shared/tasks/task-alpha.md",
      },
    ],
    approvals: [
      {
        id: "approval-alpha",
        type: "approval",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        boardId: "board-alpha",
        taskId: "task-alpha",
        status: "requested",
        outcome: "pending",
        requestedBy: "@alice",
        requestedAt: "2026-04-14T10:10:00Z",
        decidedBy: null,
        decidedAt: null,
        reason: "requires approval because restricted access is sensitive",
        createdAt: "2026-04-14T10:10:00Z",
        updatedAt: "2026-04-14T10:10:00Z",
        body: "approval body with redacted data",
        sourcePath: "vault/shared/approvals/approval-alpha.md",
      },
    ],
    docs: [
      {
        id: "doc-alpha",
        type: "doc",
        docType: "policy",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        title: "Alpha Policy",
        status: "active",
        visibility: "workspace",
        accessRoles: [],
        sensitive: false,
        createdAt: "2026-04-14T10:00:00Z",
        updatedAt: "2026-04-14T10:30:00Z",
        tags: ["alpha", "policy"],
        body: "Alpha policy includes launch checklist and kickoff steps.",
        sourcePath: "vault/shared/docs/doc-alpha.md",
      },
    ],
    agents: [],
  };
}

describe("Kioku indexing bridge", () => {
  test("emits canonical work-state updates without sensitive payloads", () => {
    const updates = buildKiokuIndexUpdates(createReadModel());

    expect(updates).toHaveLength(6);
    expect(updates.map((update) => update.document.entityType)).toEqual(["project", "board", "task", "approval", "document", "document"]);

    const payload = JSON.stringify(updates);
    expect(payload).toContain("Alpha Project");
    expect(payload).toContain("Ship Kioku bridge");
    expect(payload).toContain("Alpha Policy");
    expect(payload).toContain("Kickoff doc");
    expect(payload).not.toContain("redacted");
    expect(payload).not.toContain("executionNotes");
    expect(payload).not.toContain("result should not appear");
    expect(payload).not.toContain("approvalReason");
    expect(payload).not.toContain("body with raw token");

    const docUpdate = updates.find((update) => update.document.entityId === "doc-alpha");
    expect(docUpdate?.document.projectId).toBe("project-alpha");
    expect(docUpdate?.document.summary).toBe("Alpha policy includes launch checklist and kickoff steps.");

    const attachmentUpdate = updates.find((update) => update.document.entityId === "project-alpha:attachment:0");
    expect(attachmentUpdate?.document.projectId).toBe("project-alpha");
    expect(attachmentUpdate?.document.title).toBe("Kickoff doc");
    expect(attachmentUpdate?.document.summary).toContain("https://example.com/kickoff");
  });

  test("resolves Kioku hits back to canonical RelayHQ state", () => {
    const readModel = createReadModel();
    const hits: ReadonlyArray<KiokuSearchHit> = [
      { entityType: "task", entityId: "task-alpha", score: 0.99 },
      { entityType: "document", entityId: "doc-alpha", score: 0.95 },
      { entityType: "task", entityId: "task-missing", score: 0.9 },
      { entityType: "project", entityId: "project-alpha", score: 0.8 },
      { entityType: "approval", entityId: "approval-alpha", score: 0.7 },
      { entityType: "board", entityId: "board-alpha", score: 0.6 },
      { entityType: "task", entityId: "task-alpha", score: 0.5 },
    ];

    const resolved = resolveKiokuRetrieval(readModel, hits, "kioku bridge");

    expect(resolved.query).toBe("kioku bridge");
    expect(resolved.hits).toBe(hits);
    expect(resolved.projects).toEqual([readModel.projects[0]]);
    expect(resolved.boards).toEqual([readModel.boards[0]]);
    expect(resolved.tasks).toEqual([readModel.tasks[0]]);
    expect(resolved.approvals).toEqual([readModel.approvals[0]]);
    expect(resolved.docs).toEqual([readModel.docs[0]]);
    expect(resolved.tasks[0].title).toBe("Ship Kioku bridge");
    expect(resolved.tasks[0].executionNotes).toBe("do not index this internal note");
  });

  test("queries Kioku for retrieval and hydrates canonical RelayHQ entities", async () => {
    const readModel = createReadModel();
    const hits: ReadonlyArray<KiokuSearchHit> = [{ entityType: "project", entityId: "project-alpha", score: 1 }];
    const searchClient: KiokuSearchClient = {
      search: async (query: string) => {
        expect(query).toBe("alpha project");
        return hits;
      },
    };

    const resolved = await retrieveKiokuCanonicalState(readModel, searchClient, "alpha project");

    expect(resolved.hits).toBe(hits);
    expect(resolved.projects).toEqual([readModel.projects[0]]);
    expect(resolved.boards).toEqual([]);
    expect(resolved.tasks).toEqual([]);
    expect(resolved.approvals).toEqual([]);
    expect(resolved.docs).toEqual([]);
  });
});
