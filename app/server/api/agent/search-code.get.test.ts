import { describe, expect, test } from "bun:test";

import { searchCodeIndex } from "./search-code.get";

describe("GET /api/agent/search-code", () => {
  test("returns hint when no code documents have been indexed", () => {
    const response = searchCodeIndex("relayhq", {
      search: () => [],
      listEntityIds: () => [],
      fetchById: () => null,
    });

    expect(response).toEqual({
      query: "relayhq",
      hits: [],
      hint: "Run `relayhq index <path>` to index your codebase first",
    });
  });

  test("filters non-document entities and returns code hits", () => {
    const response = searchCodeIndex("search", {
      search: () => [
        { entityType: "task", entityId: "task-1", score: 0.1 },
        { entityType: "document", entityId: "src/api/search.ts", score: 0.2 },
      ],
      listEntityIds: () => ["task-1", "src/api/search.ts"],
      fetchById: (entityId: string) => {
        if (entityId === "src/api/search.ts") {
          return {
            entityType: "document",
            entityId,
            workspaceId: "default",
            projectId: null,
            boardId: null,
            taskId: null,
            title: "search.ts",
            summary: "search.ts - exports: searchCodeIndex",
            keywords: [],
            relations: [],
            updatedAt: "2026-04-23T00:00:00Z",
            sourcePath: "src/api/search.ts",
            canonical: true,
          };
        }

        if (entityId === "task-1") {
          return {
            entityType: "task",
            entityId,
            workspaceId: "default",
            projectId: null,
            boardId: null,
            taskId: entityId,
            title: "Task",
            summary: "Task summary",
            keywords: [],
            relations: [],
            updatedAt: "2026-04-23T00:00:00Z",
            sourcePath: "vault/shared/tasks/task-1.md",
            canonical: true,
          };
        }

        return null;
      },
    });

    expect(response.hits).toEqual([
      {
        id: "src/api/search.ts",
        title: "search.ts",
        summary: "search.ts - exports: searchCodeIndex",
        sourcePath: "src/api/search.ts",
        score: 0.2,
        codebaseName: null,
      },
    ]);
  });

  test("rejects missing query", () => {
    expect(() => searchCodeIndex("   ", {
      search: () => [],
      listEntityIds: () => [],
      fetchById: () => null,
    })).toThrow("q is required");
  });

  test("filters hits by project when projectId is provided", () => {
    const response = searchCodeIndex("search", {
      search: () => [
        { entityType: "document", entityId: "project-a:src/a.ts", score: 0.1 },
        { entityType: "document", entityId: "project-b:src/b.ts", score: 0.2 },
      ],
      listEntityIds: () => ["project-a:src/a.ts", "project-b:src/b.ts"],
      fetchById: (entityId: string) => ({
        entityType: "document",
        entityId,
        workspaceId: "ws",
        projectId: entityId.startsWith("project-a") ? "project-a" : "project-b",
        boardId: null,
        taskId: null,
        title: entityId,
        summary: entityId,
        keywords: [],
        relations: [],
        updatedAt: "2026-04-23T00:00:00Z",
        sourcePath: entityId,
        canonical: true,
        codebaseName: entityId.startsWith("project-a") ? "frontend" : "backend",
      }),
    }, "project-a");

    expect(response.hits).toHaveLength(1);
    expect(response.hits[0]?.id).toBe("project-a:src/a.ts");
    expect(response.hits[0]?.codebaseName).toBe("frontend");
  });
});
