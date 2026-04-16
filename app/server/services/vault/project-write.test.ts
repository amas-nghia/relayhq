import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { VaultLockError, VaultStaleWriteError } from "./lock";
import { VaultSchemaError, readProjectDocument, serializeProjectDocument, syncProjectDocument } from "./project-write";
import type { ProjectFrontmatter } from "./repository";

function createProject(overrides: Partial<ProjectFrontmatter> = {}): ProjectFrontmatter {
  return {
    id: "project-auth",
    type: "project",
    workspace_id: "ws-acme",
    name: "Authentication",
    created_at: "2026-04-14T10:00:00Z",
    updated_at: "2026-04-14T10:00:00Z",
    ...overrides,
  };
}

async function createVaultFile(project: ProjectFrontmatter, body = "") {
  const directory = await mkdtemp(join(tmpdir(), "relayhq-project-write-"));
  const filePath = join(directory, "project-auth.md");

  await writeFile(filePath, serializeProjectDocument(project, body), "utf8");

  return { directory, filePath };
}

describe("vault project write flow", () => {
  test("writes project updates atomically", async () => {
    const now = new Date("2026-04-14T12:00:00Z");
    const { filePath } = await createVaultFile(createProject(), "# Project notes\n");

    const result = await syncProjectDocument({
      filePath,
      actorId: "agent-backend-dev",
      now,
      mutate: () => ({ name: "Identity Platform" }),
    });

    expect(result.previous.name).toBe("Authentication");
    expect(result.frontmatter.name).toBe("Identity Platform");
    expect(result.frontmatter.updated_at).toBe(now.toISOString());
    expect(result.body).toBe("# Project notes\n");

    const diskState = await readProjectDocument(filePath);
    expect(diskState.frontmatter.name).toBe("Identity Platform");
  });

  test("rejects stale write locks before overwrite", async () => {
    const now = new Date("2026-04-14T12:00:00Z");
    const stale = new Date("2026-04-14T10:00:00Z").toISOString();
    const { filePath } = await createVaultFile(createProject());
    const before = await readFile(filePath, "utf8");

    await writeFile(
      `${filePath}.lock`,
      JSON.stringify({
        actor_id: "agent-other",
        heartbeat_at: stale,
        lock_expires_at: stale,
      }),
      "utf8",
    );

    await expect(
      syncProjectDocument({
        filePath,
        actorId: "agent-backend-dev",
        now,
        staleAfterMs: 5 * 60 * 1000,
        mutate: () => ({ name: "Recovered" }),
      }),
    ).rejects.toBeInstanceOf(VaultStaleWriteError);

    const after = await readFile(filePath, "utf8");
    expect(after).toBe(before);
  });

  test("rejects contended write locks before overwrite", async () => {
    const now = new Date("2026-04-14T12:00:00Z");
    const freshLease = new Date("2026-04-14T12:10:00Z").toISOString();
    const { filePath } = await createVaultFile(createProject(), "# Project notes\nkeep me");
    const before = await readFile(filePath, "utf8");

    await writeFile(
      `${filePath}.lock`,
      JSON.stringify({
        actor_id: "agent-other",
        heartbeat_at: now.toISOString(),
        lock_expires_at: freshLease,
      }),
      "utf8",
    );

    await expect(
      syncProjectDocument({
        filePath,
        actorId: "agent-backend-dev",
        now,
        mutate: () => ({ name: "Recovered" }),
      }),
    ).rejects.toBeInstanceOf(VaultLockError);

    const after = await readFile(filePath, "utf8");
    expect(after).toBe(before);
  });

  test("validates project writes before disk mutation", async () => {
    const now = new Date("2026-04-14T12:00:00Z");
    const { filePath } = await createVaultFile(createProject());

    await expect(
      syncProjectDocument({
        filePath,
        actorId: "agent-backend-dev",
        now,
        mutate: () => ({
          id: "project-evil",
          name: "Bearer abcdefghijklmnopqrstuvwxyz012345",
        }),
      }),
    ).rejects.toBeInstanceOf(VaultSchemaError);

    const content = await readFile(filePath, "utf8");
    expect(content).toContain('name: "Authentication"');
  });
});
