import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { writeShellProfile } from "./shell-profile.post";

describe("POST /api/settings/shell-profile", () => {
  test("writes exports once and stays idempotent", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "relayhq-shell-profile-"));

    try {
      const first = await writeShellProfile("zshrc", {
        homeDir,
        env: { ...process.env, RELAYHQ_VAULT_ROOT: "/tmp/demo-vault" },
      });

      expect(first).toEqual({
        written: true,
        path: join(homeDir, ".zshrc"),
      });
      await expect(readFile(join(homeDir, ".zshrc"), "utf8")).resolves.toContain('export RELAYHQ_VAULT_ROOT="/tmp/demo-vault"');

      const second = await writeShellProfile("zshrc", {
        homeDir,
        env: { ...process.env, RELAYHQ_VAULT_ROOT: "/tmp/demo-vault" },
      });

      expect(second).toEqual({
        written: false,
        path: join(homeDir, ".zshrc"),
      });
    } finally {
      await rm(homeDir, { recursive: true, force: true });
    }
  });
});
