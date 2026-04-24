import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { browseDirectories } from "./browse.get";

describe("GET /api/settings/browse", () => {
  test("lists child directories and marks vault roots", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-browse-"));
    const emptyDir = join(root, "empty");
    const vaultDir = join(root, "existing-vault");

    try {
      await mkdir(emptyDir, { recursive: true });
      await mkdir(join(vaultDir, "vault", "shared"), { recursive: true });

      const response = await browseDirectories(root);

      expect(response.currentPath).toBe(root);
      expect(response.entries).toEqual([
        { name: "empty", path: emptyDir, isVaultRoot: false },
        { name: "existing-vault", path: vaultDir, isVaultRoot: true },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects missing directories", async () => {
    await expect(browseDirectories(join(tmpdir(), "relayhq-browse-missing"))).rejects.toMatchObject({ statusCode: 404 });
  });
});
