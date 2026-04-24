import fs from "node:fs";
import path from "node:path";

import { resolveVaultWorkspaceRoot } from "../vault/runtime";

export interface TokenSavingsEntry {
  readonly timestamp: string;
  readonly agent: string;
  readonly endpoint: "context" | "planner-context" | "tasks" | "bootstrap" | "search" | "search-code" | "session";
  readonly taskId?: string;
  readonly responseTokens: number;
  readonly baselineTokens: number;
  readonly savedTokens: number;
}

// Tokens an agent would need to gather equivalent information without RelayHQ.
// Baselines measured from actual vault with 65 tasks (Apr 2026):
//   context          = workspace/project/board raw files (~800) + README skim (~2,200)
//   tasks            = full read-model JSON measured at ~1,890 tokens
//   bootstrap        = raw task file (~333) + all board tasks (~5,000) + protocol docs (~700)
//   search           = scanning all task files (~5,089 tokens measured)
//   planner-context  = measured at ~2,519 tokens
//   session (before) = 23,096 chars / 4 = ~5,774 tokens (65 tasks including done)
//   session (after)  = 8,257 chars / 4 = ~2,064 tokens (26 open tasks only)
const BASELINE_TOKENS: Record<TokenSavingsEntry["endpoint"], number> = {
  context: 3000,
  "planner-context": 5000,
  tasks: 1890,
  bootstrap: 6000,
  search: 5000,
  "search-code": 15000,
  session: 5774,
};

export function computeSaving(
  endpoint: TokenSavingsEntry["endpoint"],
  responseTokens: number,
): { baselineTokens: number; savedTokens: number } {
  const baselineTokens = BASELINE_TOKENS[endpoint];
  return { baselineTokens, savedTokens: Math.max(0, baselineTokens - responseTokens) };
}

function getMetricsPath(): string {
  const vaultRoot = resolveVaultWorkspaceRoot();
  return path.join(vaultRoot, ".relayhq", "token-savings.jsonl");
}

export function countTokens(json: unknown): number {
  return Math.round(JSON.stringify(json).length / 4);
}

export function recordTokenSaving(entry: TokenSavingsEntry): void {
  try {
    const filePath = getMetricsPath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // non-blocking — never crash the API on metrics failure
  }
}

export function readTokenSavings(): ReadonlyArray<TokenSavingsEntry> {
  try {
    const filePath = getMetricsPath();
    const content = fs.readFileSync(filePath, "utf8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TokenSavingsEntry);
  } catch {
    return [];
  }
}
