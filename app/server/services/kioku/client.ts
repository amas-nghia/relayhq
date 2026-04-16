import type { KiokuWorkStateEntityType } from "./indexer";

export interface KiokuSearchHit {
  readonly entityType: KiokuWorkStateEntityType;
  readonly entityId: string;
  readonly score: number;
}

export interface KiokuSearchClient {
  search(query: string): Promise<ReadonlyArray<KiokuSearchHit>>;
}

export interface KiokuRetrievalClientConfig {
  readonly baseUrl: string;
  readonly searchPath?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export class KiokuUnavailableError extends Error {
  public readonly endpoint: string;
  public readonly operation: "search";

  constructor(message: string, endpoint: string, cause?: unknown) {
    super(message, { cause });
    this.name = "KiokuUnavailableError";
    this.endpoint = endpoint;
    this.operation = "search";
  }
}

export class KiokuContractError extends Error {
  public readonly endpoint: string;

  constructor(message: string, endpoint: string, cause?: unknown) {
    super(message, { cause });
    this.name = "KiokuContractError";
    this.endpoint = endpoint;
  }
}

interface KiokuSearchResponse {
  readonly hits: ReadonlyArray<KiokuSearchHit>;
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim();

  if (normalized.length === 0) {
    throw new KiokuUnavailableError("Kioku base URL is not configured.", "<unconfigured>");
  }

  try {
    return new URL(normalized).toString().replace(/\/$/, "");
  } catch (error) {
    throw new KiokuUnavailableError("Kioku base URL is invalid.", "<unconfigured>", error);
  }
}

function buildSearchEndpoint(baseUrl: string, searchPath: string | undefined): string {
  const path = searchPath ?? "/api/search";
  return new URL(path, `${baseUrl}/`).toString();
}

function isSearchHit(value: unknown): value is KiokuSearchHit {
  return (
    typeof value === "object" &&
    value !== null &&
    "entityType" in value &&
    "entityId" in value &&
    "score" in value &&
    typeof (value as KiokuSearchHit).entityType === "string" &&
    typeof (value as KiokuSearchHit).entityId === "string" &&
    typeof (value as KiokuSearchHit).score === "number" &&
    Number.isFinite((value as KiokuSearchHit).score)
  );
}

function parseSearchResponse(value: unknown, endpoint: string): KiokuSearchResponse {
  if (typeof value !== "object" || value === null || !("hits" in value) || !Array.isArray((value as { hits?: unknown }).hits)) {
    throw new KiokuContractError("Kioku search response must contain a hits array.", endpoint);
  }

  const hits = (value as { hits: ReadonlyArray<unknown> }).hits;
  if (!hits.every(isSearchHit)) {
    throw new KiokuContractError("Kioku search response contained an invalid hit.", endpoint);
  }

  return { hits };
}

function assertQuery(query: string, endpoint: string): string {
  const normalized = query.trim();

  if (normalized.length === 0) {
    throw new KiokuContractError("Kioku search query must not be empty.", endpoint);
  }

  return normalized;
}

export function createKiokuRetrievalClient(config: KiokuRetrievalClientConfig): KiokuSearchClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const endpoint = buildSearchEndpoint(baseUrl, config.searchPath);
  const timeoutMs = config.timeoutMs ?? 5_000;
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);

  return {
    async search(query: string): Promise<ReadonlyArray<KiokuSearchHit>> {
      const normalizedQuery = assertQuery(query, endpoint);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({ query: normalizedQuery }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new KiokuUnavailableError(`Kioku search returned ${response.status}.`, endpoint);
        }

        const payload = parseSearchResponse(await response.json(), endpoint);
        return payload.hits;
      } catch (error) {
        if (error instanceof KiokuUnavailableError || error instanceof KiokuContractError) {
          throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
          throw new KiokuUnavailableError("Kioku search timed out.", endpoint, error);
        }

        throw new KiokuUnavailableError("Kioku search is unavailable.", endpoint, error);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
