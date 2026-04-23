import { afterEach, describe, expect, test } from "bun:test";

import type { KiokuIndexDocument } from "./indexer";
import { createKiokuStorage } from "./storage";

function createDocument(overrides: Partial<KiokuIndexDocument> = {}): KiokuIndexDocument {
  return {
    entityType: "task",
    entityId: "task-001",
    workspaceId: "ws-demo",
    projectId: "project-relayhq-dev",
    boardId: "board-dev-sprint",
    taskId: "task-001",
    title: "Ship Kioku storage",
    summary: "SQLite-backed search storage for RelayHQ Kioku retrieval.",
    keywords: ["kioku", "sqlite", "storage"],
    relations: [
      { kind: "project", id: "project-relayhq-dev" },
      { kind: "task", id: "task-001" },
    ],
    updatedAt: "2026-04-19T00:00:00Z",
    sourcePath: "vault/shared/tasks/task-001.md",
    canonical: true,
    ...overrides,
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

describe("Kioku storage", () => {
  test("upsert is idempotent and fetchById returns stored documents", () => {
    const storage = withStorage();
    const document = createDocument();

    storage.upsert(document);
    storage.upsert({ ...document, summary: "Updated summary for relayhq sqlite boundary." });

    expect(storage.fetchById(document.entityId)).toEqual({
      ...document,
      codebaseName: null,
      summary: "Updated summary for relayhq sqlite boundary.",
    });
    expect(storage.count()).toBe(1);
  });

  test("deleteById removes stored rows", () => {
    const storage = withStorage();
    const document = createDocument();

    storage.upsert(document);
    expect(storage.fetchById(document.entityId)).not.toBeNull();

    storage.deleteById(document.entityId);

    expect(storage.fetchById(document.entityId)).toBeNull();
    expect(storage.count()).toBe(0);
  });

  test("search returns ranked hits from the FTS index", () => {
    const storage = withStorage();
    const storageDoc = createDocument();
    const contractDoc = createDocument({
      entityId: "task-002",
      title: "Lock HTTP contract",
      summary: "Define the Kioku HTTP search contract and endpoint semantics.",
      keywords: ["kioku", "http", "contract"],
    });

    storage.upsert(storageDoc);
    storage.upsert(contractDoc);

    const hits = storage.search("kioku contract", 5);

    expect(hits.map((hit) => hit.entityId)).toContain("task-002");
    expect(hits[0]?.entityType).toBe("task");
    expect(typeof hits[0]?.score).toBe("number");
  });

  test("supports :memory: databases for all operations", () => {
    const storage = withStorage();
    const document = createDocument({ entityId: "task-memory", keywords: ["memory", "sqlite", "storage"] });

    storage.upsert(document);
    expect(storage.fetchById("task-memory")?.entityId).toBe("task-memory");
    expect(storage.search("memory").map((hit) => hit.entityId)).toContain("task-memory");
  });

  test("normalizes hyphenated queries before FTS lookup", () => {
    const storage = withStorage();
    const document = createDocument({
      entityType: "document",
      entityId: "src/api/search-code.ts",
      codebaseName: "frontend",
      title: "search-code.ts",
      summary: "Search code endpoint for indexed documents.",
      keywords: ["search", "code", "endpoint"],
      sourcePath: "src/api/search-code.ts",
    });

    storage.upsert(document);
    expect(storage.search("search-code").map((hit) => hit.entityId)).toContain("src/api/search-code.ts");
    expect(storage.fetchById("src/api/search-code.ts")?.codebaseName).toBe("frontend");
  });

  test("rejects queries that do not contain searchable tokens", () => {
    const storage = withStorage();
    storage.upsert(createDocument());

    expect(() => storage.search('"" () :::')).toThrow("searchable tokens");
  });
});
