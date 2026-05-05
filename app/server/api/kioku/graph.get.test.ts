import { describe, expect, test } from "bun:test";

import { getKiokuGraphResponse } from "./graph.get";

describe("GET /api/kioku/graph", () => {
  test("rejects thresholds outside the allowed 0..1 range", () => {
    expect(() => getKiokuGraphResponse({ threshold: "1.5" }, {
      listEntityIds: () => [],
      fetchById: () => null,
    } as never)).toThrow("threshold must be a number between 0 and 1");
  });

  test("trims the project filter before building the graph", () => {
    const response = getKiokuGraphResponse({ projectId: "  project-alpha  ", threshold: "0.1" }, {
      listEntityIds: () => ["doc-a", "doc-b", "doc-c"],
      fetchById: (entityId: string) => {
        if (entityId === "doc-c") {
          return {
            entityType: "document",
            entityId,
            workspaceId: "ws-demo",
            projectId: "project-beta",
            boardId: null,
            taskId: null,
            title: "Beta doc",
            summary: "beta unrelated",
            keywords: ["beta"],
            relations: [],
            updatedAt: "2026-05-01T00:00:00Z",
            sourcePath: "docs/beta.md",
            canonical: true,
            codebaseName: null,
          };
        }

        return {
          entityType: "document",
          entityId,
          workspaceId: "ws-demo",
          projectId: "project-alpha",
          boardId: null,
          taskId: null,
          title: entityId === "doc-a" ? "Alpha graph" : "Alpha edges",
          summary: "shared alpha knowledge",
          keywords: ["alpha", "shared"],
          relations: [],
          updatedAt: "2026-05-01T00:00:00Z",
          sourcePath: `docs/${entityId}.md`,
          canonical: true,
          codebaseName: null,
        };
      },
    } as never);

    expect(response.nodes.map((node) => node.id)).toEqual(["doc-a", "doc-b"]);
    expect(response.edges).toHaveLength(1);
  });
});
