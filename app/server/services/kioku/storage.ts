import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";

import type { KiokuIndexDocument } from "./indexer";
import type { KiokuSearchHit } from "./client";
import { resolveVaultWorkspaceRoot } from "../vault/runtime";

const DEFAULT_KIOKU_DB_PATH = process.env.KIOKU_DB_PATH ?? ".relayhq/kioku.sqlite";

type StoredDocumentRow = {
  entity_type: KiokuIndexDocument["entityType"];
  entity_id: string;
  workspace_id: string;
  project_id: string | null;
  board_id: string | null;
  task_id: string | null;
  codebase_name: string | null;
  title: string;
  summary: string;
  keywords_json: string;
  relations_json: string;
  updated_at: string;
  source_path: string;
  canonical: number;
};

type SearchRow = {
  entity_type: KiokuSearchHit["entityType"];
  entity_id: string;
  score: number;
};

type SqliteStatement = {
  run(...params: Array<unknown>): unknown;
  get(...params: Array<unknown>): unknown;
  all(...params: Array<unknown>): unknown;
};

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
};

export interface KiokuStorage {
  upsert(document: KiokuIndexDocument): void;
  fetchById(entityId: string): KiokuIndexDocument | null;
  deleteById(entityId: string): void;
  listEntityIds(): ReadonlyArray<string>;
  search(query: string, limit?: number): ReadonlyArray<KiokuSearchHit>;
  count(): number;
  close(): void;
}

export class KiokuSearchQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KiokuSearchQueryError";
  }
}

const require = createRequire(import.meta.url);

function createSqliteDatabase(path: string): SqliteDatabase {
  if ("Bun" in globalThis) {
    const bunSqliteModule = ["bun", "sqlite"].join(":");
    const { Database } = require(bunSqliteModule) as { Database: new (path: string, options?: Record<string, unknown>) => SqliteDatabase };
    return new Database(path, { create: true, strict: true });
  }

  const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDatabase };
  return new DatabaseSync(path);
}

function runInTransaction(database: SqliteDatabase, work: () => void): void {
  database.exec("BEGIN");
  try {
    work();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function parseJsonArray<T>(value: string): ReadonlyArray<T> {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? (parsed as ReadonlyArray<T>) : [];
}

function rowToDocument(row: StoredDocumentRow | null): KiokuIndexDocument | null {
  if (row === null) {
    return null;
  }

  return {
    entityType: row.entity_type,
    entityId: row.entity_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    boardId: row.board_id,
    taskId: row.task_id,
    codebaseName: row.codebase_name,
    title: row.title,
    summary: row.summary,
    keywords: parseJsonArray<string>(row.keywords_json),
    relations: parseJsonArray<KiokuIndexDocument["relations"][number]>(row.relations_json),
    updatedAt: row.updated_at,
    sourcePath: row.source_path,
    canonical: true,
  };
}

function normalizeSearchQuery(query: string): string {
  const normalized = query.trim().replace(/\s+/g, " ");
  if (normalized.length === 0) {
    throw new KiokuSearchQueryError("Kioku search query must not be empty.");
  }

  const tokens = normalized
    .split(" ")
    .flatMap((token) => token.split(/[^A-Za-z0-9_]+/g))
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

  if (tokens.length === 0) {
    throw new KiokuSearchQueryError("Kioku search query did not contain any searchable tokens.");
  }

  return tokens.map((token) => `${token}*`).join(" ");
}

function resolveKiokuDbPath(dbPath: string): string {
  if (dbPath === ":memory:") {
    return dbPath;
  }

  const absolutePath = isAbsolute(dbPath) ? dbPath : resolve(resolveVaultWorkspaceRoot(), dbPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  return absolutePath;
}

function initializeSchema(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS kioku_documents (
      entity_type TEXT NOT NULL,
      entity_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      board_id TEXT,
      task_id TEXT,
      codebase_name TEXT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      relations_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      source_path TEXT NOT NULL,
      canonical INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS kioku_documents_fts USING fts5(
      entity_id UNINDEXED,
      title,
      summary,
      keywords_text
    );
  `);
}

export function createKiokuStorage(dbPath: string = DEFAULT_KIOKU_DB_PATH): KiokuStorage {
  const resolvedPath = resolveKiokuDbPath(dbPath);
  const database = createSqliteDatabase(resolvedPath);
  initializeSchema(database);

  const upsertRow = database.prepare(`
    INSERT INTO kioku_documents (
      entity_type,
      entity_id,
      workspace_id,
      project_id,
      board_id,
      task_id,
      codebase_name,
      title,
      summary,
      keywords_json,
      relations_json,
      updated_at,
      source_path,
      canonical
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(entity_id) DO UPDATE SET
      entity_type = excluded.entity_type,
      workspace_id = excluded.workspace_id,
      project_id = excluded.project_id,
      board_id = excluded.board_id,
      task_id = excluded.task_id,
      codebase_name = excluded.codebase_name,
      title = excluded.title,
      summary = excluded.summary,
      keywords_json = excluded.keywords_json,
      relations_json = excluded.relations_json,
      updated_at = excluded.updated_at,
      source_path = excluded.source_path,
      canonical = excluded.canonical
  `);

  const deleteFtsRow = database.prepare(`DELETE FROM kioku_documents_fts WHERE entity_id = ?`);
  const insertFtsRow = database.prepare(`INSERT INTO kioku_documents_fts (entity_id, title, summary, keywords_text) VALUES (?, ?, ?, ?)`);
  const fetchRow = database.prepare(`SELECT * FROM kioku_documents WHERE entity_id = ? LIMIT 1`);
  const deleteRow = database.prepare(`DELETE FROM kioku_documents WHERE entity_id = ?`);
  const countRow = database.prepare(`SELECT COUNT(*) AS count FROM kioku_documents`);
  const listEntityIds = database.prepare(`SELECT entity_id FROM kioku_documents ORDER BY entity_id ASC`);
  const searchRows = database.prepare(`
    SELECT d.entity_type, d.entity_id, bm25(kioku_documents_fts, 8.0, 4.0, 2.0) AS score
    FROM kioku_documents_fts
    JOIN kioku_documents d ON d.entity_id = kioku_documents_fts.entity_id
    WHERE kioku_documents_fts MATCH ?
    ORDER BY score ASC, d.updated_at DESC
    LIMIT ?
  `);

  const runUpsert = (document: KiokuIndexDocument) => runInTransaction(database, () => {
    const keywordsJson = JSON.stringify(document.keywords);
    const relationsJson = JSON.stringify(document.relations);
    const keywordsText = document.keywords.join(" ");

    upsertRow.run(
      document.entityType,
      document.entityId,
      document.workspaceId,
      document.projectId,
      document.boardId,
      document.taskId,
      document.codebaseName ?? null,
      document.title,
      document.summary,
      keywordsJson,
      relationsJson,
      document.updatedAt,
      document.sourcePath,
      document.canonical ? 1 : 0,
    );

    deleteFtsRow.run(document.entityId);
    insertFtsRow.run(document.entityId, document.title, document.summary, keywordsText);
  });

  const runDelete = (entityId: string) => runInTransaction(database, () => {
    deleteFtsRow.run(entityId);
    deleteRow.run(entityId);
  });

  return {
    upsert(document) {
      runUpsert(document);
    },
    fetchById(entityId) {
      return rowToDocument(fetchRow.get(entityId) as StoredDocumentRow | null);
    },
    deleteById(entityId) {
      runDelete(entityId);
    },
    listEntityIds() {
      return (listEntityIds.all() as Array<{ entity_id: string }>).map((row) => row.entity_id);
    },
    search(query, limit = 10) {
      const normalized = normalizeSearchQuery(query);
      return (searchRows.all(normalized, limit) as Array<SearchRow>).map((row) => ({
        entityType: row.entity_type,
        entityId: row.entity_id,
        score: Number.isFinite(row.score) ? row.score : 0,
      }));
    },
    count() {
      const row = countRow.get() as { count: number };
      return row.count;
    },
    close() {
      database.close();
    },
  };
}

let sharedKiokuStorage: KiokuStorage | null = null;

export function getKiokuStorage(): KiokuStorage {
  if (sharedKiokuStorage === null) {
    sharedKiokuStorage = createKiokuStorage();
  }

  return sharedKiokuStorage;
}
