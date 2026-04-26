import { describe, expect, test } from "bun:test";

import { searchAgentContextWith } from "./search.post";

describe("POST /api/agent/search-context", () => {
  test("returns sanitized grouped results", async () => {
    const result = await searchAgentContextWith({ query: "auth" }, async () => ({
      query: "auth",
      hits: [],
      tasks: [{ id: "task-1", workspaceId: "ws", projectId: "project-1", boardId: "board-1", columnId: "todo", status: "todo", priority: "high", title: "Auth task", assignee: "agent", progress: 0, approvalNeeded: false, approvalOutcome: "pending", dependsOn: [], tags: [], updatedAt: "2026", isStale: false }],
      projects: [{ id: "project-1", workspaceId: "ws", name: "Project 1", boardIds: [], taskIds: [], approvalIds: [], updatedAt: "2026" }],
      boards: [{ id: "board-1", workspaceId: "ws", projectId: "project-1", name: "Board 1", columnIds: [], taskIds: [], approvalIds: [], updatedAt: "2026" }],
      approvals: [],
      docs: [{ id: "doc-1", workspaceId: "ws", projectId: "project-1", title: "Auth spec", docType: "spec", status: "active", visibility: "workspace", updatedAt: "2026" }],
    } as any));
    expect(result.tasks[0]).toEqual(expect.objectContaining({ id: "task-1", title: "Auth task" }));
    expect((result as any).tasks[0].body).toBeUndefined();
    expect(result.docs[0]).toEqual(expect.objectContaining({ id: "doc-1", title: "Auth spec", projectId: "project-1" }));
    expect((result as any).docs[0].body).toBeUndefined();
  });

  test("rejects empty query", async () => {
    await expect(searchAgentContextWith({ query: "   " }, async () => ({ query: "", tasks: [], projects: [], boards: [], hits: [], approvals: [], docs: [] } as any))).rejects.toMatchObject({ statusCode: 422 });
  });
});
