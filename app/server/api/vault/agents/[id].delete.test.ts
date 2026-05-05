import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { deleteVaultAgent } from "./[id].delete";

async function seedRoot() {
  const root = await mkdtemp(join(tmpdir(), "relayhq-agent-delete-"));
  await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "agents"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "workspaces", "ws-demo.md"), `---\nid: "ws-demo"\ntype: workspace\nname: "Demo"\nowner_ids: ["@owner"]\nmember_ids: ["@owner"]\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
  return root;
}

describe("DELETE /api/vault/agents/[id]", () => {
  test("deletes the agent avatar file when no other agent references it", async () => {
    const root = await seedRoot();
    const assetDir = join(process.cwd(), "web", "public", "assets", "agents");
    const avatarName = `agent-avatar-test-${Date.now()}.webp`;
    const avatarPath = join(assetDir, avatarName);

    await mkdir(assetDir, { recursive: true });
    await writeFile(avatarPath, "avatar", "utf8");
    await writeFile(join(root, "vault", "shared", "agents", "agent-a.md"), `---\nid: "agent-a"\ntype: agent\nname: "Agent A"\nrole: implementation\nroles: ["implementation"]\nprovider: openai\nmodel: gpt-5.4\ncapabilities: []\ntask_types_accepted: []\napproval_required_for: []\ncannot_do: []\naccessible_by: []\nskill_file: "skills/a.md"\nstatus: available\nworkspace_id: "ws-demo"\nsprite_asset: "/assets/agents/${avatarName}"\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");

    try {
      await expect(deleteVaultAgent("agent-a", { vaultRoot: root })).resolves.toEqual({ success: true, agentId: "agent-a" });
      await expect(readFile(join(root, "vault", "shared", "agents", "agent-a.md"), "utf8")).rejects.toBeTruthy();
      await expect(readFile(avatarPath, "utf8")).rejects.toBeTruthy();
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(avatarPath, { force: true });
    }
  });

  test("keeps the avatar file when another agent still references it", async () => {
    const root = await seedRoot();
    const assetDir = join(process.cwd(), "web", "public", "assets", "agents");
    const avatarName = `agent-avatar-shared-${Date.now()}.webp`;
    const avatarPath = join(assetDir, avatarName);

    await mkdir(assetDir, { recursive: true });
    await writeFile(avatarPath, "avatar", "utf8");
    const agentDoc = (id: string) => `---\nid: "${id}"\ntype: agent\nname: "${id}"\nrole: implementation\nroles: ["implementation"]\nprovider: openai\nmodel: gpt-5.4\ncapabilities: []\ntask_types_accepted: []\napproval_required_for: []\ncannot_do: []\naccessible_by: []\nskill_file: "skills/${id}.md"\nstatus: available\nworkspace_id: "ws-demo"\nsprite_asset: "/assets/agents/${avatarName}"\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`;
    await writeFile(join(root, "vault", "shared", "agents", "agent-a.md"), agentDoc("agent-a"), "utf8");
    await writeFile(join(root, "vault", "shared", "agents", "agent-b.md"), agentDoc("agent-b"), "utf8");

    try {
      await expect(deleteVaultAgent("agent-a", { vaultRoot: root })).resolves.toEqual({ success: true, agentId: "agent-a" });
      await expect(readFile(join(root, "vault", "shared", "agents", "agent-b.md"), "utf8")).resolves.toContain("agent-b");
      await expect(readFile(avatarPath, "utf8")).resolves.toBe("avatar");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(avatarPath, { force: true });
    }
  });
});
