import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { readSettingsState } from "../settings.get";

import { initializeVault } from "./init.post";

describe("POST /api/vault/init", () => {
  test("creates a vault scaffold and activates it immediately", async () => {
    const root = await mkdtemp(join(tmpdir(), `relayhq-vault-init-${randomUUID()}-`));
    const envDirectory = await mkdtemp(join(tmpdir(), `relayhq-vault-init-env-${randomUUID()}-`));
    const envPath = join(envDirectory, ".env");
    const env = { ...process.env };

    try {
      const response = await initializeVault(
        {
          vaultRoot: root,
          workspaceName: "Init Workspace",
        },
        { envPath, env },
      );

      expect(response.created).toContain("vault/shared/workspaces/ws-init-workspace.md");
      expect(response.vaultRoot).toBe(root);
      expect(response.workspaceId).toBe("ws-init-workspace");

      await expect(readFile(envPath, "utf8")).resolves.toContain(`RELAYHQ_VAULT_ROOT=${root}`);
      await expect(readFile(envPath, "utf8")).resolves.toContain("RELAYHQ_WORKSPACE_ID=ws-init-workspace");

      const settings = await readSettingsState({ cwd: join(root, "app"), env });
      expect(settings.isValid).toBe(true);
      expect(settings.vaultRoot).toBe(root);
      expect(settings.activeWorkspaceId).toBe("ws-init-workspace");
      expect(settings.activeWorkspaceName).toBe("Init Workspace");
    } finally {
      await Promise.all([
        rm(root, { recursive: true, force: true }),
        rm(envDirectory, { recursive: true, force: true }),
      ]);
    }
  });

  test("returns 409 when the vault already exists", async () => {
    const root = await mkdtemp(join(tmpdir(), `relayhq-vault-init-existing-${randomUUID()}-`));
    const envDirectory = await mkdtemp(join(tmpdir(), `relayhq-vault-init-existing-env-${randomUUID()}-`));
    const envPath = join(envDirectory, ".env");
    const env = { ...process.env };

    try {
      await initializeVault(
        {
          vaultRoot: root,
          workspaceName: "First Workspace",
        },
        { envPath, env },
      );

      await expect(initializeVault(
        {
          vaultRoot: root,
          workspaceName: "Second Workspace",
        },
        { envPath, env },
      )).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      await Promise.all([
        rm(root, { recursive: true, force: true }),
        rm(envDirectory, { recursive: true, force: true }),
      ]);
    }
  });
});
