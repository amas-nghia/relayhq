import { describe, expect, test } from "bun:test";

import { readApiKeys } from "./api-keys.get";

describe("GET /api/settings/api-keys", () => {
  test("exposes only set state and a last-four preview", () => {
    const response = readApiKeys({
      ...process.env,
      ANTHROPIC_API_KEY: "  ",
      OPENAI_API_KEY: "sk-test-12345678",
      GOOGLE_API_KEY: "google-secret-4321",
      GEMINI_API_KEY: undefined,
      OPENROUTER_API_KEY: "openrouter-key-9876",
    });

    expect(response.keys).toEqual([
      {
        envVar: "ANTHROPIC_API_KEY",
        provider: "anthropic",
        label: "Anthropic",
        isSet: false,
        preview: null,
        source: undefined,
      },
      {
        envVar: "OPENAI_API_KEY",
        provider: "openai",
        label: "OpenAI",
        isSet: true,
        preview: "···5678",
        source: "env",
      },
      {
        envVar: "GOOGLE_API_KEY",
        provider: "google",
        label: "Google",
        isSet: true,
        preview: "···4321",
        source: "env",
      },
      {
        envVar: "GEMINI_API_KEY",
        provider: "google",
        label: "Google (Gemini)",
        isSet: false,
        preview: null,
        source: undefined,
      },
      {
        envVar: "OPENROUTER_API_KEY",
        provider: "openrouter",
        label: "OpenRouter",
        isSet: true,
        preview: "···9876",
        source: "env",
      },
    ]);

    expect(JSON.stringify(response)).not.toContain("sk-test-12345678");
    expect(JSON.stringify(response)).not.toContain("google-secret-4321");
  });
});
