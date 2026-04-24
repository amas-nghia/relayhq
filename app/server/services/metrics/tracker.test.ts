import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { computeSaving, countTokens, readTokenSavings, recordTokenSaving } from "./tracker";

const previousRoot = process.env.RELAYHQ_VAULT_ROOT;

afterEach(async () => {
  if (previousRoot === undefined) {
    delete process.env.RELAYHQ_VAULT_ROOT;
  } else {
    process.env.RELAYHQ_VAULT_ROOT = previousRoot;
  }
});

describe("token savings tracker", () => {
  test("records and reads token savings entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-metrics-"));
    process.env.RELAYHQ_VAULT_ROOT = root;
    try {
      recordTokenSaving({ timestamp: "2026-04-19T00:00:00Z", agent: "agent-a", endpoint: "context", responseTokens: 100, baselineTokens: 3000, savedTokens: 2900 });
      const entries = readTokenSavings();
      expect(entries).toEqual([
        expect.objectContaining({ agent: "agent-a", endpoint: "context", savedTokens: 2900 }),
      ]);
      const file = await readFile(join(root, ".relayhq", "token-savings.jsonl"), "utf8");
      expect(file).toContain('"agent":"agent-a"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("counts tokens and computes non-negative savings", () => {
    expect(countTokens({ hello: "world" })).toBeGreaterThan(0);
    expect(computeSaving("tasks", 2000)).toEqual({ baselineTokens: 1890, savedTokens: 0 });
  });
});
