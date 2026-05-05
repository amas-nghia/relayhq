import { describe, expect, test } from "bun:test";

import { readHealthStatus } from "./health.get";

describe("GET /api/health", () => {
  test("returns the stable health contract", () => {
    expect(readHealthStatus({ version: "1.2.3", uptime: 42, vaultRoot: "/tmp/relayhq-vault" })).toEqual({
      status: "ok",
      version: "1.2.3",
      uptime: 42,
      vaultRoot: "/tmp/relayhq-vault",
    });
  });
});
