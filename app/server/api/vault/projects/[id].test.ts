import { readdir, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { updateProjectMetadata } from "./[id]";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "relayhq-project-update-"));
  roots.push(root);
  await mkdir(join(root, "vault", "shared", "projects"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "audit"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "projects", "project-demo.md"), [
    "---",
    'id: "project-demo"',
    'type: "project"',
    'workspace_id: "ws-demo"',
    'name: "Demo Project"',
    'codebases: []',
    'created_at: "2026-04-23T00:00:00Z"',
    'updated_at: "2026-04-23T00:00:00Z"',
    "---",
    "# Demo Project",
    "",
    "## Description",
    "Original description",
    "",
    "## Status",
    "Active",
    "",
  ].join("\n"), "utf8");
  return root;
}

describe("PATCH /api/vault/projects/[id]", () => {
  test("updates project metadata and writes an audit note", async () => {
    const root = await createRoot();
    const response = await updateProjectMetadata("project-demo", {
      actorId: "agent-claude-code",
      patch: {
        name: "Renamed Project",
        description: "New description",
        status: "Paused",
        codebases: [{ name: "frontend", path: "../repo", tech: "Nuxt", primary: true }],
      },
    }, { vaultRoot: root });

    expect(response).toEqual({
      id: "project-demo",
      name: "Renamed Project",
      codebases: [{ name: "frontend", path: "../repo", tech: "Nuxt", primary: true }],
      description: "New description",
      status: "Paused",
    });

    const projectDocument = await readFile(join(root, "vault", "shared", "projects", "project-demo.md"), "utf8");
    expect(projectDocument).toContain('name: "Renamed Project"');
    expect(projectDocument).toContain('codebases: [{"name":"frontend","path":"../repo","tech":"Nuxt","primary":true}]');
    expect(projectDocument).toContain("## Description\nNew description");
    expect(projectDocument).toContain("## Status\nPaused");

    const auditFiles = await readdir(join(root, "vault", "shared", "audit"));
    expect(auditFiles).toHaveLength(1);
    const auditDocument = await readFile(join(root, "vault", "shared", "audit", auditFiles[0]!), "utf8");
    expect(auditDocument).toContain("Updated project metadata for Renamed Project");
  });
});
