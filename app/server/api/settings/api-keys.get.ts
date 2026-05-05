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
  readonly source?: 'env';
}

export interface ApiKeysResponse {
  readonly keys: ReadonlyArray<ApiKeyEntry>;
}

export default defineEventHandler(async () => {
  const keys: ApiKeyEntry[] = [];

  for (const { envVar, provider, label } of KNOWN_KEYS) {
    const envValue = process.env[envVar];
    const isEnvSet = typeof envValue === 'string' && envValue.trim().length > 0;

    keys.push({
      envVar,
      provider,
      label,
      isSet: isEnvSet,
      preview: isEnvSet ? `···${envValue!.slice(-4)}` : null,
      source: isEnvSet ? 'env' : undefined,
    });
  }

  return { keys };
});
