import { describe, expect, test } from "bun:test";

import { createKiokuRetrievalClient, KiokuUnavailableError, type KiokuSearchHit } from "./client";

function createResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe("Kioku retrieval client", () => {
  test("calls the real Kioku retrieval boundary and returns hits", async () => {
    const requests: Array<{ readonly input: RequestInfo | URL; readonly init?: RequestInit }> = [];
    const hits: ReadonlyArray<KiokuSearchHit> = [{ entityType: "task", entityId: "task-alpha", score: 0.98 }];

    const client = createKiokuRetrievalClient({
      baseUrl: "https://kioku.local",
      fetchImpl: async (input, init) => {
        requests.push({ input, init });
        return createResponse({ hits });
      },
    });

    await expect(client.search("  relayhq source of truth  ")).resolves.toEqual(hits);
    expect(requests).toHaveLength(1);
    expect(String(requests[0]?.input)).toBe("https://kioku.local/api/search");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.headers).toEqual({
      "content-type": "application/json",
      accept: "application/json",
    });
    expect(requests[0]?.init?.body).toBe(JSON.stringify({ query: "relayhq source of truth" }));
  });

  test("fails fast when Kioku is unavailable", async () => {
    const client = createKiokuRetrievalClient({
      baseUrl: "https://kioku.local",
      fetchImpl: async () => createResponse({ error: "service unavailable" }, 503),
    });

    const promise = client.search("relayhq boundary");
    await expect(promise).rejects.toBeInstanceOf(KiokuUnavailableError);
    await expect(promise).rejects.toThrow("503");
  });
});
