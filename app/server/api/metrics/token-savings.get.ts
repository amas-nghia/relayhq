import { defineEventHandler } from "h3";

import { readTokenSavings, type TokenSavingsEntry } from "../../services/metrics/tracker";

const SONNET_INPUT_COST_PER_1M = 3.0;

function costUsd(tokens: number): number {
  return Math.round((tokens / 1_000_000) * SONNET_INPUT_COST_PER_1M * 1_000_000) / 1_000_000;
}

function groupBy<T>(items: ReadonlyArray<T>, key: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    (result[k] ??= []).push(item);
  }
  return result;
}

function sumField(items: ReadonlyArray<TokenSavingsEntry>, field: keyof TokenSavingsEntry): number {
  return items.reduce((acc, e) => acc + (typeof e[field] === "number" ? (e[field] as number) : 0), 0);
}

function toDay(timestamp: string): string {
  return timestamp.slice(0, 10);
}

export function aggregateTokenSavings(entries: ReadonlyArray<TokenSavingsEntry>) {
  const totalCalls = entries.length;
  const totalResponseTokens = sumField(entries, "responseTokens");
  const totalBaselineTokens = sumField(entries, "baselineTokens");
  const totalSavedTokens = sumField(entries, "savedTokens");
  const savingPct = totalBaselineTokens > 0 ? Math.round((totalSavedTokens / totalBaselineTokens) * 100) : 0;

  // per-agent
  const byAgentRaw = groupBy(entries, (e) => e.agent);
  const byAgent = Object.entries(byAgentRaw)
    .map(([agent, rows]) => ({
      agent,
      calls: rows.length,
      savedTokens: sumField(rows, "savedTokens"),
      savedUsd: costUsd(sumField(rows, "savedTokens")),
    }))
    .sort((a, b) => b.savedTokens - a.savedTokens);

  // per-endpoint
  const byEndpointRaw = groupBy(entries, (e) => e.endpoint);
  const byEndpoint = Object.entries(byEndpointRaw)
    .map(([endpoint, rows]) => ({
      endpoint,
      calls: rows.length,
      avgResponseTokens: Math.round(sumField(rows, "responseTokens") / rows.length),
      baselineTokens: rows[0]?.baselineTokens ?? 0,
      savedTokens: sumField(rows, "savedTokens"),
    }))
    .sort((a, b) => b.savedTokens - a.savedTokens);

  // daily timeline (last 14 days)
  const byDayRaw = groupBy(entries, (e) => toDay(e.timestamp));
  const timeline = Object.entries(byDayRaw)
    .map(([day, rows]) => ({
      day,
      calls: rows.length,
      savedTokens: sumField(rows, "savedTokens"),
    }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-14);

  return {
    totals: {
      calls: totalCalls,
      responseTokens: totalResponseTokens,
      baselineTokens: totalBaselineTokens,
      savedTokens: totalSavedTokens,
      savedUsd: costUsd(totalSavedTokens),
      savingPct,
    },
    byAgent,
    byEndpoint,
    timeline,
    recentCalls: [...entries].reverse().slice(0, 50),
  };
}

export default defineEventHandler(() => {
  const entries = readTokenSavings();
  return aggregateTokenSavings(entries);
});
