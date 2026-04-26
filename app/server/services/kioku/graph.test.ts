import { describe, expect, test } from "bun:test";

import { createKiokuStorage } from "./storage";
import { buildKiokuGraph } from "./graph";

describe("Kioku graph", () => {
  test("returns empty graph when storage is empty", () => {
    const storage = createKiokuStorage(":memory:");

    expect(buildKiokuGraph(storage)).toEqual({ nodes: [], edges: [] });
    storage.close();
  });

  test("builds nodes and similarity edges for project knowledge documents", () => {
    const storage = createKiokuStorage(":memory:");

    storage.upsert({
      entityType: "document",
      entityId: "doc-alpha",
      workspaceId: "ws-alpha",
      projectId: "project-alpha",
      boardId: null,
      taskId: null,
      codebaseName: null,
      title: "Alpha Spec",
      summary: "Alpha launch checklist and rollout notes.",
      keywords: ["alpha", "launch", "checklist"],
      relations: [{ kind: "project", id: "project-alpha" }],
      updatedAt: "2026-04-25T00:00:00Z",
      sourcePath: "vault/shared/docs/doc-alpha.md",
      canonical: true,
    });

    storage.upsert({
      entityType: "task",
      entityId: "task-alpha",
      workspaceId: "ws-alpha",
      projectId: "project-alpha",
      boardId: "board-alpha",
      taskId: "task-alpha",
      codebaseName: null,
      title: "Alpha launch task",
      summary: "Task for launch checklist and rollout notes.",
      keywords: ["alpha", "launch"],
      relations: [{ kind: "project", id: "project-alpha" }],
      updatedAt: "2026-04-25T00:00:00Z",
      sourcePath: "vault/shared/tasks/task-alpha.md",
      canonical: true,
    });

    storage.upsert({
      entityType: "document",
      entityId: "project-alpha:attachment:0",
      workspaceId: "ws-alpha",
      projectId: "project-alpha",
      boardId: null,
      taskId: null,
      codebaseName: null,
      title: "Kickoff deck",
      summary: "Attachment Kickoff deck (pdf) https://example.com/kickoff",
      keywords: ["project-alpha", "kickoff", "pdf", "attachment"],
      relations: [{ kind: "project", id: "project-alpha" }],
      updatedAt: "2026-04-25T00:00:00Z",
      sourcePath: "vault/shared/projects/project-alpha.md#attachment:0",
      canonical: true,
    });

    const graph = buildKiokuGraph(storage, { projectId: "project-alpha", threshold: 0.15 });

    expect(graph.nodes.map((node) => node.id)).toEqual(["doc-alpha", "project-alpha:attachment:0", "task-alpha"]);
    expect(graph.nodes.map((node) => node.type)).toEqual(["doc", "attachment", "task"]);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.edges.every((edge) => edge.score >= 0.15)).toBe(true);

    storage.close();
  });
});
