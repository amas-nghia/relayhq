import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { createVaultProject } from "../server/api/vault/projects.post";
import readModelHandler from "../server/api/vault/read-model.get";

async function seedWorkspace(root: string) {
  await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "workspaces", "ws-demo.md"), `---\nid: "ws-demo"\ntype: "workspace"\nname: "Demo"\nowner_ids: ["@owner"]\nmember_ids: ["@owner"]\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
}

describe("vault project creation", () => {
  test("creates project, board, and four columns", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-projects-"));
    try {
      await Promise.all([
        mkdir(join(root, "vault", "shared", "projects"), { recursive: true }),
        mkdir(join(root, "vault", "shared", "boards"), { recursive: true }),
        mkdir(join(root, "vault", "shared", "columns"), { recursive: true }),
      ]);
      await seedWorkspace(root);
      process.env.RELAYHQ_VAULT_ROOT = root;
      const result = await createVaultProject({ name: "My Project" }, { vaultRoot: root, now: new Date("2026-04-19T00:00:00Z") });
      expect(result.project.id).toContain("project-my-project-");
      expect(result.columns).toHaveLength(4);
      const model = await readModelHandler({} as never);
      expect(model.projects.map((project: any) => project.id)).toContain(result.project.id);
      expect(model.boards.map((board: any) => board.id)).toContain(result.board.id);
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects missing name", async () => {
    await expect(createVaultProject({ name: "   " })).rejects.toMatchObject({ statusCode: 400 });
  });
});
