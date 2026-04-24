import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { readSettingsState } from "./settings.get";
import readModelHandler from "./vault/read-model.get";
import { saveVaultRootSetting } from "./settings.post";
import { validateSettingsPathBody } from "./settings/validate.post";

async function createWorkspaceRoot(workspaceId: string, workspaceName: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `relayhq-settings-${randomUUID()}-`));
  const workspaceDirectory = join(root, "vault", "shared", "workspaces");

  await mkdir(workspaceDirectory, { recursive: true });
  await writeFile(
    join(workspaceDirectory, `${workspaceId}.md`),
    [
      "---",
      `id: ${workspaceId}`,
      "type: workspace",
      `name: ${workspaceName}`,
      'owner_ids: ["@owner"]',
      'member_ids: ["@owner"]',
      "created_at: 2026-04-19T10:00:00Z",
      "updated_at: 2026-04-19T10:00:00Z",
      "---",
      "",
    ].join("\n"),
    "utf8",
  );

  return root;
}

async function createWorkspaceSet(workspaces: ReadonlyArray<{ id: string; name: string }>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `relayhq-settings-multi-${randomUUID()}-`));
  const workspaceDirectory = join(root, "vault", "shared", "workspaces");
  await mkdir(workspaceDirectory, { recursive: true });

  await Promise.all(workspaces.map((workspace) =>
    writeFile(
      join(workspaceDirectory, `${workspace.id}.md`),
      [
        "---",
        `id: ${workspace.id}`,
        "type: workspace",
        `name: ${workspace.name}`,
        'owner_ids: ["@owner"]',
        'member_ids: ["@owner"]',
        "created_at: 2026-04-19T10:00:00Z",
        "updated_at: 2026-04-19T10:00:00Z",
        "---",
        "",
      ].join("\n"),
      "utf8",
    ),
  ));

  return root;
}

describe("settings endpoints", () => {
  test("GET /api/settings reports configured and unconfigured state", async () => {
    const configuredRoot = await createWorkspaceRoot("ws-configured", "Configured Workspace");
    const unconfiguredRoot = await createWorkspaceRoot("ws-default", "Default Workspace");

    try {
      const configuredState = await readSettingsState({
        cwd: join(unconfiguredRoot, "app"),
        env: { ...process.env, RELAYHQ_VAULT_ROOT: configuredRoot, RELAYHQ_WORKSPACE_ID: "ws-configured" },
      });

      expect(configuredState).toEqual({
        vaultRoot: configuredRoot,
        resolvedRoot: configuredRoot,
        isValid: true,
        invalidReason: null,
        activeWorkspaceId: "ws-configured",
        activeWorkspaceName: "Configured Workspace",
        availableWorkspaces: [{ id: "ws-configured", name: "Configured Workspace" }],
      });

      const unconfiguredState = await readSettingsState({
        cwd: join(unconfiguredRoot, "app"),
        env: { ...process.env, RELAYHQ_VAULT_ROOT: undefined },
      });

      expect(unconfiguredState).toEqual({
        vaultRoot: null,
        resolvedRoot: unconfiguredRoot,
        isValid: true,
        invalidReason: null,
        activeWorkspaceId: null,
        activeWorkspaceName: null,
        availableWorkspaces: [{ id: "ws-default", name: "Default Workspace" }],
      });
    } finally {
      await Promise.all([
        rm(configuredRoot, { recursive: true, force: true }),
        rm(unconfiguredRoot, { recursive: true, force: true }),
      ]);
    }
  });

  test("POST /api/settings/validate returns valid and invalid responses", async () => {
    const validRoot = await createWorkspaceRoot("ws-valid", "Valid Workspace");
    const invalidRoot = await mkdtemp(join(tmpdir(), `relayhq-settings-invalid-${randomUUID()}-`));

    try {
      await mkdir(invalidRoot, { recursive: true });

      await expect(validateSettingsPathBody({ path: validRoot })).resolves.toEqual({
        valid: true,
        path: validRoot,
      });

      await expect(validateSettingsPathBody({ path: invalidRoot })).resolves.toEqual({
        valid: false,
        path: invalidRoot,
        reason: `Expected an accessible vault/shared directory at ${join(invalidRoot, "vault", "shared")}.`,
      });
    } finally {
      await Promise.all([
        rm(validRoot, { recursive: true, force: true }),
        rm(invalidRoot, { recursive: true, force: true }),
      ]);
    }
  });

  test("POST /api/settings rejects invalid roots before writing and applies valid roots immediately", async () => {
    const originalVaultRoot = process.env.RELAYHQ_VAULT_ROOT;
    const previousEnvContent = "OTHER_SETTING=true\n";
    const invalidRoot = await mkdtemp(join(tmpdir(), `relayhq-settings-bad-${randomUUID()}-`));
    const firstRoot = await createWorkspaceRoot("ws-first", "First Workspace");
    const secondRoot = await createWorkspaceRoot("ws-second", "Second Workspace");
    const envDirectory = await mkdtemp(join(tmpdir(), `relayhq-settings-env-${randomUUID()}-`));
    const envPath = join(envDirectory, ".env");

    await writeFile(envPath, previousEnvContent, "utf8");
    process.env.RELAYHQ_VAULT_ROOT = firstRoot;

    try {
      await expect(saveVaultRootSetting(invalidRoot, null, { envPath })).rejects.toMatchObject({ statusCode: 422 });
      await expect(readFile(envPath, "utf8")).resolves.toBe(previousEnvContent);
      expect(process.env.RELAYHQ_VAULT_ROOT).toBe(firstRoot);

      await expect(saveVaultRootSetting(secondRoot, null, { envPath })).resolves.toEqual({
        success: true,
        vaultRoot: secondRoot,
        workspaceId: null,
      });

      await expect(readFile(envPath, "utf8")).resolves.toBe(`${previousEnvContent}RELAYHQ_VAULT_ROOT=${secondRoot}\n`);
      expect(process.env.RELAYHQ_VAULT_ROOT).toBe(secondRoot);

      await expect(saveVaultRootSetting(secondRoot, "ws-second", { envPath })).resolves.toEqual({
        success: true,
        vaultRoot: secondRoot,
        workspaceId: "ws-second",
      });

      await expect(readFile(envPath, "utf8")).resolves.toBe(`${previousEnvContent}RELAYHQ_VAULT_ROOT=${secondRoot}\nRELAYHQ_WORKSPACE_ID=ws-second\n`);
      expect(process.env.RELAYHQ_WORKSPACE_ID).toBe("ws-second");

      const readModel = await readModelHandler({} as never);
      expect(readModel.workspaces).toEqual([
        expect.objectContaining({ id: "ws-second", name: "Second Workspace" }),
      ]);

      await expect(saveVaultRootSetting(secondRoot, "missing-workspace", { envPath })).rejects.toMatchObject({ statusCode: 422 });
    } finally {
      if (originalVaultRoot === undefined) {
        delete process.env.RELAYHQ_VAULT_ROOT;
      } else {
        process.env.RELAYHQ_VAULT_ROOT = originalVaultRoot;
      }

      delete process.env.RELAYHQ_WORKSPACE_ID;

      await Promise.all([
        rm(invalidRoot, { recursive: true, force: true }),
        rm(firstRoot, { recursive: true, force: true }),
        rm(secondRoot, { recursive: true, force: true }),
        rm(envDirectory, { recursive: true, force: true }),
      ]);
    }
  });

  test("read-model honors RELAYHQ_WORKSPACE_ID filtering while settings exposes available workspaces", async () => {
    const previousVaultRoot = process.env.RELAYHQ_VAULT_ROOT;
    const previousWorkspaceId = process.env.RELAYHQ_WORKSPACE_ID;
    const root = await createWorkspaceSet([
      { id: "ws-alpha", name: "Alpha Workspace" },
      { id: "ws-beta", name: "Beta Workspace" },
    ]);

    try {
      process.env.RELAYHQ_VAULT_ROOT = root;
      process.env.RELAYHQ_WORKSPACE_ID = "ws-beta";

      const settings = await readSettingsState({ cwd: join(root, "app"), env: process.env });
      expect(settings.availableWorkspaces).toEqual([
        { id: "ws-alpha", name: "Alpha Workspace" },
        { id: "ws-beta", name: "Beta Workspace" },
      ]);
      expect(settings.activeWorkspaceId).toBe("ws-beta");
      expect(settings.activeWorkspaceName).toBe("Beta Workspace");

      const readModel = await readModelHandler({} as never);
      expect(readModel.workspaces).toEqual([
        expect.objectContaining({ id: "ws-beta", name: "Beta Workspace" }),
      ]);
    } finally {
      if (previousVaultRoot === undefined) {
        delete process.env.RELAYHQ_VAULT_ROOT;
      } else {
        process.env.RELAYHQ_VAULT_ROOT = previousVaultRoot;
      }

      if (previousWorkspaceId === undefined) {
        delete process.env.RELAYHQ_WORKSPACE_ID;
      } else {
        process.env.RELAYHQ_WORKSPACE_ID = previousWorkspaceId;
      }

      await rm(root, { recursive: true, force: true });
    }
  });
});
