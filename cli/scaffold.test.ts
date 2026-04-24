import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import test from "node:test";

import { readCanonicalVaultReadModel } from "../app/server/services/vault/read";
import { buildPrefixedId, scaffoldVault } from "./scaffold";

test("creates required directories and seed files", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-init-"));

    try {
      const result = await scaffoldVault({
        vaultRoot: root,
        workspaceName: "My Workspace",
        workspaceId: buildPrefixedId("ws", "My Workspace", "workspace"),
      });

      assert.equal(result.alreadyExists, false);
      assert.ok(result.created.includes("vault/shared/workspaces/ws-my-workspace.md"));

      const model = await readCanonicalVaultReadModel(root);
      assert.equal(model.workspaces.length, 1);
      assert.equal(model.workspaces[0]?.id, "ws-my-workspace");
      assert.equal(model.projects.length, 0);
      assert.equal(model.boards.length, 0);
      assert.equal(model.columns.length, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

test("returns alreadyExists when vault/shared already exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-init-existing-"));

    try {
      await scaffoldVault({
        vaultRoot: root,
        workspaceName: "One",
        workspaceId: "ws-one",
      });

      const second = await scaffoldVault({
        vaultRoot: root,
        workspaceName: "Two",
        workspaceId: "ws-two",
      });

      assert.equal(second.alreadyExists, true);
      assert.deepEqual(second.created, []);
      assert.deepEqual(second.skipped, [join(root, "vault", "shared")]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

test("slugifies names and preserves prefixes", () => {
  assert.equal(buildPrefixedId("ws", "  Mý   Workspace!!!  ", "workspace"), "ws-my-workspace");
  assert.equal(buildPrefixedId("ws", "ws-existing", "workspace"), "ws-existing");
  assert.equal(buildPrefixedId("ws", "###", "workspace"), "ws-workspace");
});
