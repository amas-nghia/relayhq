import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { indexCodebaseFiles } from "./code-indexer";

const tempRoots: string[] = [];

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relayhq-code-indexer-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("code-indexer", () => {
  test("returns no updates for an empty directory", async () => {
    const root = await createTempRoot();
    expect(indexCodebaseFiles(root)).toEqual([]);
  });

  test("indexes TypeScript exports into document updates", async () => {
    const root = await createTempRoot();
    const filePath = join(root, "app", "server", "example.ts");
    await mkdir(join(root, "app", "server"), { recursive: true });
    await writeFile(filePath, 'export function alpha() {}\nexport const beta = 1\nexport default class Example {}\n', "utf8");
    const mtime = new Date("2026-04-23T02:00:00.000Z");
    await utimes(filePath, mtime, mtime);

    const updates = indexCodebaseFiles(root);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual(expect.objectContaining({
      operation: "upsert",
      document: expect.objectContaining({
        entityType: "document",
        entityId: "app/server/example.ts",
        title: "example.ts",
        sourcePath: "app/server/example.ts",
        updatedAt: mtime.toISOString(),
      }),
    }));
    expect(updates[0]!.document.summary).toContain("exports: alpha, beta, Example, default");
    expect(updates[0]!.document.keywords).toEqual(expect.arrayContaining(["app/server/example.ts", "app", "server"]));
  });

  test("indexes markdown title and first paragraph", async () => {
    const root = await createTempRoot();
    const filePath = join(root, "docs", "guide.md");
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(filePath, '# Guide Title\n\nFirst paragraph summary for the guide.\n\n## Next\n- bullet\n', "utf8");

    const updates = indexCodebaseFiles(root);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.document.title).toBe("Guide Title");
    expect(updates[0]!.document.summary).toBe("First paragraph summary for the guide.");
  });

  test("skips ignored directories and test files", async () => {
    const root = await createTempRoot();
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(join(root, "src", "keep.ts"), 'export const keep = true\n', "utf8");
    await writeFile(join(root, "src", "keep.test.ts"), 'export const skip = true\n', "utf8");
    await writeFile(join(root, "node_modules", "pkg", "hidden.ts"), 'export const hidden = true\n', "utf8");

    const updates = indexCodebaseFiles(root);
    expect(updates.map((update) => update.document.entityId)).toEqual(["src/keep.ts"]);
  });
});
