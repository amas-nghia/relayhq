import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { registerAgents } from "./register-agents.post";

async function createWorkspaceRoot(workspaceId: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relayhq-register-agents-"));
  await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "workspaces", `${workspaceId}.md`), `---\nid: ${JSON.stringify(workspaceId)}\ntype: workspace\nname: "Demo Workspace"\nowner_ids: ["@owner"]\nmember_ids: ["@owner"]\ncreated_at: "2026-04-25T00:00:00Z"\nupdated_at: "2026-04-25T00:00:00Z"\n---\n`, "utf8");
  return root;
}

describe("POST /api/settings/register-agents", () => {
  test("creates vault agent files for detected tools and skips duplicates idempotently", async () => {
    const root = await createWorkspaceRoot("ws-demo");
    const home = await mkdtemp(join(tmpdir(), "relayhq-home-"));

    try {
      await mkdir(join(home, ".claude"), { recursive: true });
      await mkdir(join(home, ".kiro", "settings"), { recursive: true });
      await writeFile(join(home, ".claude", "settings.json"), "{}", "utf8");
      await writeFile(join(home, ".kiro", "settings", "mcp.json"), "{}", "utf8");

      const created = await registerAgents({ toolIds: ["claude-code", "kiro", "copilot"] }, { vaultRoot: root, homeDirectory: home, env: { ...process.env, RELAYHQ_WORKSPACE_ID: "ws-demo" } });

      expect(created).toEqual({
        created: [
          { id: "claude-code", sourcePath: "vault/shared/agents/claude-code.md" },
          { id: "kiro", sourcePath: "vault/shared/agents/kiro.md" },
        ],
        skipped: [
          { id: "copilot", reason: "not-detected" },
        ],
      });

      await expect(readFile(join(root, "vault", "shared", "agents", "claude-code.md"), "utf8")).resolves.toContain("portrait: mage");
      await expect(readFile(join(root, "vault", "shared", "agents", "claude-code.md"), "utf8")).resolves.toContain('capabilities: ["write-code","run-tests"]');
      await expect(readFile(join(root, "vault", "shared", "agents", "kiro.md"), "utf8")).resolves.toContain("portrait: forge");

      const repeated = await registerAgents({ toolIds: ["claude-code", "kiro"] }, { vaultRoot: root, homeDirectory: home, env: { ...process.env, RELAYHQ_WORKSPACE_ID: "ws-demo" } });
      expect(repeated).toEqual({
        created: [],
        skipped: [
          { id: "claude-code", reason: "already-registered" },
          { id: "kiro", reason: "already-registered" },
        ],
      });
    } finally {
      await Promise.all([
        rm(root, { recursive: true, force: true }),
        rm(home, { recursive: true, force: true }),
      ]);
    }
  });
});
