import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";

import { createOpenAIAuthStart } from "./openai/start.get";
import { readOpenAIAuthResult } from "./openai/result.get";
import { handleOpenRouterCallback } from "./openrouter/callback.get";
import { readOpenRouterAuthResult } from "./openrouter/result.get";
import { createOpenRouterAuthStart } from "./openrouter/start.get";

describe("auth routes", () => {
  test("creates a deterministic OpenAI auth URL and starts the callback server", async () => {
    let startedWith: { state: string; codeVerifier: string } | null = null;

    const response = await createOpenAIAuthStart({
      randomBytesImpl: (() => Buffer.alloc(32, 7)) as unknown as typeof randomBytes,
      createEntryImpl: (_provider, codeVerifier) => {
        startedWith = { state: "state-openai", codeVerifier: codeVerifier ?? "" };
        return "state-openai";
      },
      startCallbackServer: async (state, codeVerifier) => {
        startedWith = { state, codeVerifier };
      },
    });

    const authUrl = new URL(response.authUrl);
    expect(response.state).toBe("state-openai");
    expect(startedWith).toEqual({ state: "state-openai", codeVerifier: expect.any(String) });
    expect(authUrl.origin).toBe("https://auth.openai.com");
    expect(authUrl.searchParams.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
    expect(authUrl.searchParams.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
    expect(authUrl.searchParams.get("state")).toBe("state-openai");
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
  });

  test("surfaces OpenAI callback server startup failures as 500 errors", async () => {
    await expect(createOpenAIAuthStart({
      startCallbackServer: async () => {
        throw new Error("Port 1455 is in use");
      },
    })).rejects.toMatchObject({ statusCode: 500, statusMessage: "Port 1455 is in use" });
  });

  test("reports OpenAI auth result states deterministically", () => {
    expect(() => readOpenAIAuthResult(undefined)).toThrow("Missing state");
    expect(readOpenAIAuthResult("missing", () => undefined)).toEqual({ status: "expired" });
    expect(readOpenAIAuthResult("state-openai", () => ({
      provider: "openai",
      status: "complete",
      apiKey: "token-123",
      createdAt: Date.now(),
    }))).toEqual({
      status: "complete",
      apiKey: "token-123",
      error: undefined,
    });
  });

  test("creates an OpenRouter auth URL with callback and state", () => {
    const response = createOpenRouterAuthStart(() => "state-openrouter");

    expect(response).toEqual({
      state: "state-openrouter",
      authUrl: "https://openrouter.ai/auth?callback_url=http%3A%2F%2F127.0.0.1%3A44210%2Fapi%2Fauth%2Fopenrouter%2Fcallback&state=state-openrouter",
    });
  });

  test("reports OpenRouter auth result states deterministically", () => {
    expect(() => readOpenRouterAuthResult(undefined)).toThrow("Missing state");
    expect(readOpenRouterAuthResult("missing", () => undefined)).toEqual({ status: "expired" });
    expect(readOpenRouterAuthResult("state-openrouter", () => ({
      provider: "openrouter",
      status: "error",
      error: "Exchange failed",
      createdAt: Date.now(),
    }))).toEqual({
      status: "error",
      apiKey: undefined,
      error: "Exchange failed",
    });
  });

  test("handles OpenRouter callback edge cases and success states", async () => {
    const completed: Array<{ state: string; apiKey: string }> = [];
    const failed: Array<{ state: string; error: string }> = [];
    const entryReader = (state: string) => state === "state-openrouter"
      ? { provider: "openrouter", status: "pending" as const, createdAt: Date.now() }
      : undefined;

    expect(await handleOpenRouterCallback({}, { entryReader })).toContain("Missing code or state");
    expect(await handleOpenRouterCallback({ code: "code-1", state: "missing" }, { entryReader })).toContain("State expired or unknown");

    expect(await handleOpenRouterCallback({ code: "code-1", state: "state-openrouter" }, {
      entryReader,
      failEntryImpl: (state, error) => {
        failed.push({ state, error });
      },
      fetchImpl: async () => new Response("denied", { status: 401 }),
    })).toContain("Failed to exchange code");

    expect(failed.at(-1)).toEqual({ state: "state-openrouter", error: "Exchange failed: denied" });

    expect(await handleOpenRouterCallback({ code: "code-2", state: "state-openrouter" }, {
      entryReader,
      failEntryImpl: (state, error) => {
        failed.push({ state, error });
      },
      fetchImpl: async () => new Response(JSON.stringify({}), { status: 200 }),
    })).toContain("No key returned");

    expect(failed.at(-1)).toEqual({ state: "state-openrouter", error: "No key in response" });

    expect(await handleOpenRouterCallback({ code: "code-3", state: "state-openrouter" }, {
      entryReader,
      completeEntryImpl: (state, apiKey) => {
        completed.push({ state, apiKey });
      },
      fetchImpl: async () => new Response(JSON.stringify({ key: "or-key-123" }), { status: 200 }),
    })).toContain("Connected to OpenRouter");

    expect(completed).toEqual([{ state: "state-openrouter", apiKey: "or-key-123" }]);

    expect(await handleOpenRouterCallback({ code: "code-4", state: "state-openrouter" }, {
      entryReader,
      failEntryImpl: (state, error) => {
        failed.push({ state, error });
      },
      fetchImpl: async () => {
        throw new Error("network down");
      },
    })).toContain("Error during connection");

    expect(failed.at(-1)).toEqual({ state: "state-openrouter", error: "network down" });
  });
});
