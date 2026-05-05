import { afterEach, describe, expect, test } from "bun:test";

import { verifyProviderApiKey } from "./verify-key.post";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("POST /api/settings/verify-key", () => {
  test("returns invalid for provider 401 responses", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 });

    const result = await verifyProviderApiKey("openai", "bad-key");

    expect(result).toEqual({ valid: false, error: "Invalid API key" });
  });

  test("returns invalid for unknown providers without calling fetch", async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return new Response(null, { status: 200 });
    };

    const result = await verifyProviderApiKey("unknown", "test-key");

    expect(called).toBe(false);
    expect(result).toEqual({ valid: false, error: "Unknown provider: unknown" });
  });
});
