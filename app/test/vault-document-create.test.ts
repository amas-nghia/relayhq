import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { createVaultDocument } from "../server/api/vault/documents.post";
import documentsHandler from "../server/api/vault/documents.get";

describe("vault document creation", () => {
  test("creates a markdown file for a new document", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-docs-"));
    try {
      const result = await createVaultDocument({ title: "My Note" }, { vaultRoot: root, now: new Date("2026-04-19T00:00:00Z") });
      expect(result.title).toBe("My Note");
      expect(result.sourcePath).toBe("my-note.md");
      await expect(readFile(join(root, "vault", "my-note.md"), "utf8")).resolves.toBe("# My Note\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("applies numeric suffix when a title already exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-docs-dupe-"));
    try {
      await createVaultDocument({ title: "My Note" }, { vaultRoot: root });
      const second = await createVaultDocument({ title: "My Note" }, { vaultRoot: root });
      expect(second.sourcePath).toBe("my-note-2.md");
      expect(await readdir(join(root, "vault"))).toEqual(["my-note-2.md", "my-note.md"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects empty titles and the list endpoint includes new docs", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-docs-list-"));
    try {
      await expect(createVaultDocument({ title: "   " }, { vaultRoot: root })).rejects.toMatchObject({ statusCode: 400 });
      await createVaultDocument({ title: "Explorer Note", content: "Body" }, { vaultRoot: root });
      process.env.RELAYHQ_VAULT_ROOT = root;
      const docs = await documentsHandler({} as never);
      expect(docs).toEqual(expect.arrayContaining([expect.objectContaining({ title: "Explorer Note", sourcePath: "explorer-note.md" })]));
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });
});
