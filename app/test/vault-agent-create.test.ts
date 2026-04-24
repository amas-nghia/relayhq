import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { createVaultAgent } from "../server/api/vault/agents.post";

async function seedWorkspace(root: string) {
  await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "workspaces", "ws-demo.md"), `---\nid: "ws-demo"\ntype: "workspace"\nname: "Demo"\nowner_ids: ["@owner"]\nmember_ids: ["@owner"]\ncreated_at: "2026-04-19T00:00:00Z"\nupdated_at: "2026-04-19T00:00:00Z"\n---\n`, "utf8");
}

describe("vault agent create", () => {
  test("creates agent file and rejects duplicates", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-agent-"));
    try {
      await seedWorkspace(root);
      const agent = await createVaultAgent({ name: "Agent Product Strategist", role: "product-strategist", model: "claude-sonnet-4-6", provider: "anthropic" }, { vaultRoot: root, now: new Date("2026-04-19T00:00:00Z") });
      expect(agent.agent.id).toBe("agent-product-strategist");
      await expect(createVaultAgent({ name: "Agent Product Strategist", role: "product-strategist", model: "claude-sonnet-4-6", provider: "anthropic" }, { vaultRoot: root })).rejects.toMatchObject({ statusCode: 409 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
