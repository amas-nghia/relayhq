import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { createKiokuStorage } from "./storage";
import { indexProjectCodebase, listProjectCodebaseStatuses, readProjectCodeIndexStatus } from "./project-index";

const roots: string[] = [];
const storages: ReturnType<typeof createKiokuStorage>[] = [];

afterEach(async () => {
  for (const storage of storages.splice(0)) {
    storage.close();
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "relayhq-project-index-"));
  roots.push(root);
  return root;
}

function withStorage() {
  const storage = createKiokuStorage(":memory:");
  storages.push(storage);
  return storage;
}

describe("project code indexing", () => {
  test("reports unconfigured and indexed status correctly", async () => {
    const root = await createRoot();
    const storage = withStorage();

    expect(readProjectCodeIndexStatus({ id: "project-demo", codebases: [] }, root, storage).status).toBe("unconfigured");

    const codebaseRoot = join(root, "repo");
    await mkdir(codebaseRoot, { recursive: true });
    await writeFile(join(codebaseRoot, "index.ts"), "export const demo = true\n", "utf8");

    const project = { id: "project-demo", workspaceId: "ws-demo", codebases: [{ name: "main", path: "repo", primary: true }] };
    expect(readProjectCodeIndexStatus(project, root, storage).status).toBe("not-indexed");

    const result = indexProjectCodebase(project, root, storage);
    expect(result.indexedFiles).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(result.resolvedPaths).toHaveLength(1);

    const status = readProjectCodeIndexStatus(project, root, storage);
    expect(status.status).toBe("indexed");
    expect(status.fileCount).toBe(1);
    expect(storage.fetchById("project-demo:main:index.ts")?.projectId).toBe("project-demo");
  });

  test("indexes multiple codebases and skips missing paths with warnings", async () => {
    const root = await createRoot();
    const storage = withStorage();

    const frontendRoot = join(root, "frontend");
    const backendRoot = join(root, "backend");
    await mkdir(frontendRoot, { recursive: true });
    await writeFile(join(frontendRoot, "page.ts"), "export const page = true\n", "utf8");
    await mkdir(backendRoot, { recursive: true });
    await writeFile(join(backendRoot, "service.ts"), "export const service = true\n", "utf8");

    const result = indexProjectCodebase({
      id: "project-demo",
      workspaceId: "ws-demo",
      codebases: [
        { name: "frontend", path: "frontend", primary: true },
        { name: "backend", path: "backend" },
        { name: "missing", path: "missing" },
      ],
    }, root, storage);

    expect(result.indexedFiles).toBe(2);
    expect(result.warnings).toEqual([`Skipping missing codebase path for missing: ${join(root, "missing")}`]);
    expect(storage.fetchById("project-demo:frontend:page.ts")?.codebaseName).toBe("frontend");
    expect(storage.fetchById("project-demo:backend:service.ts")?.codebaseName).toBe("backend");
  });

  test("reports status per codebase and allows indexing one named codebase", async () => {
    const root = await createRoot();
    const storage = withStorage();

    const frontendRoot = join(root, "frontend");
    const backendRoot = join(root, "backend");
    await mkdir(frontendRoot, { recursive: true });
    await writeFile(join(frontendRoot, "page.ts"), "export const page = true\n", "utf8");
    await mkdir(backendRoot, { recursive: true });
    await writeFile(join(backendRoot, "service.ts"), "export const service = true\n", "utf8");

    const project = {
      id: "project-demo",
      workspaceId: "ws-demo",
      codebases: [
        { name: "frontend", path: "frontend", primary: true, tech: "Nuxt" },
        { name: "backend", path: "backend", tech: "Go" },
      ],
    };

    const before = listProjectCodebaseStatuses(project, root, storage);
    expect(before.map((entry) => [entry.name, entry.status])).toEqual([
      ["frontend", "not-indexed"],
      ["backend", "not-indexed"],
    ]);

    const result = indexProjectCodebase(project, root, storage, "frontend");
    expect(result.indexedFiles).toBe(1);

    const after = listProjectCodebaseStatuses(project, root, storage);
    expect(after.map((entry) => [entry.name, entry.status])).toEqual([
      ["frontend", "indexed"],
      ["backend", "not-indexed"],
    ]);
  });
});
