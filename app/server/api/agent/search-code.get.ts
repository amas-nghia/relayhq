import { createError, defineEventHandler, getQuery } from "h3";

import { countTokens, computeSaving, recordTokenSaving } from "../../services/metrics/tracker";
import { getKiokuStorage, KiokuSearchQueryError, type KiokuStorage } from "../../services/kioku/storage";

export interface SearchCodeHit {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly sourcePath: string;
  readonly score: number;
  readonly codebaseName?: string | null;
}

export interface SearchCodeResponse {
  readonly query: string;
  readonly hits: ReadonlyArray<SearchCodeHit>;
  readonly hint?: string;
}

function readQueryParam(query: unknown): string {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw createError({ statusCode: 422, statusMessage: "q is required." });
  }

  return query.trim();
}

function hasIndexedDocuments(storage: Pick<KiokuStorage, "listEntityIds" | "fetchById">): boolean {
  return storage.listEntityIds().some((entityId) => storage.fetchById(entityId)?.entityType === "document");
}

export function searchCodeIndex(
  query: string,
  storage: Pick<KiokuStorage, "search" | "listEntityIds" | "fetchById">,
  projectId?: string,
): SearchCodeResponse {
  const trimmedQuery = readQueryParam(query);
  const hasDocuments = hasIndexedDocuments(storage);

  if (!hasDocuments) {
    return {
      query: trimmedQuery,
      hits: [],
      hint: "Run `relayhq index <path>` to index your codebase first",
    };
  }

  const hits = storage
    .search(trimmedQuery, 50)
    .filter((hit) => hit.entityType === "document")
    .map((hit) => {
      const document = storage.fetchById(hit.entityId);
      if (document === null || document.entityType !== "document") {
        return null;
      }
      if (projectId !== undefined && document.projectId !== projectId) {
        return null;
      }

        return {
          id: document.entityId,
          title: document.title,
          summary: document.summary,
          sourcePath: document.sourcePath,
          score: hit.score,
          codebaseName: document.codebaseName ?? null,
        } satisfies SearchCodeHit;
    })
    .filter((hit): hit is SearchCodeHit => hit !== null)
    .slice(0, 10);

  return { query: trimmedQuery, hits };
}

export default defineEventHandler((event) => {
  const { q, agent, projectId } = getQuery(event);
  const storage = getKiokuStorage();

  try {
    const response = searchCodeIndex(
      String(q ?? ""),
      storage,
      typeof projectId === "string" && projectId.trim().length > 0 ? projectId.trim() : undefined,
    );
    const responseTokens = countTokens(response);
    const { baselineTokens, savedTokens } = computeSaving("search-code", responseTokens);
    recordTokenSaving({
      timestamp: new Date().toISOString(),
      agent: String(agent ?? "anonymous"),
      endpoint: "search-code",
      responseTokens,
      baselineTokens,
      savedTokens,
    });
    return response;
  } catch (error) {
    if (error instanceof KiokuSearchQueryError) {
      throw createError({ statusCode: 422, statusMessage: error.message });
    }
    throw error;
  }
});
