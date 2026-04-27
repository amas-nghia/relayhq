import { defineEventHandler } from "h3";

const KNOWN_KEYS: ReadonlyArray<{ envVar: string; provider: string; label: string }> = [
  { envVar: "ANTHROPIC_API_KEY",  provider: "anthropic", label: "Anthropic" },
  { envVar: "OPENAI_API_KEY",     provider: "openai",    label: "OpenAI" },
  { envVar: "GOOGLE_API_KEY",     provider: "google",    label: "Google" },
  { envVar: "GEMINI_API_KEY",     provider: "google",    label: "Google (Gemini)" },
  { envVar: "OPENROUTER_API_KEY", provider: "openrouter",label: "OpenRouter" },
];

export interface ApiKeyEntry {
  readonly envVar: string;
  readonly provider: string;
  readonly label: string;
  readonly isSet: boolean;
  readonly preview: string | null; // last 4 chars only
}

export interface ApiKeysResponse {
  readonly keys: ReadonlyArray<ApiKeyEntry>;
}

export function detectApiKeys(env: NodeJS.ProcessEnv = process.env): ApiKeysResponse {
  const keys = KNOWN_KEYS.map(({ envVar, provider, label }) => {
    const value = env[envVar];
    const isSet = typeof value === "string" && value.trim().length > 0;
    return {
      envVar,
      provider,
      label,
      isSet,
      preview: isSet ? `···${value!.slice(-4)}` : null,
    } satisfies ApiKeyEntry;
  });

  return { keys };
}

export default defineEventHandler(() => detectApiKeys());
