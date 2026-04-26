import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { scanAgents } from "./scan-agents.get";

async function createWorkspaceRoot(workspaceId: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relayhq-scan-agents-"));
  await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "agents"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "workspaces", `${workspaceId}.md`), `---\nid: ${JSON.stringify(workspaceId)}\ntype: workspace\nname: "Demo Workspace"\nowner_ids: ["@owner"]\nmember_ids: ["@owner"]\ncreated_at: "2026-04-25T00:00:00Z"\nupdated_at: "2026-04-25T00:00:00Z"\n---\n`, "utf8");
  return root;
}

describe("GET /api/settings/scan-agents", () => {
  test("reports detected tools and already registered agents", async () => {
    const root = await createWorkspaceRoot("ws-demo");
    const home = await mkdtemp(join(tmpdir(), "relayhq-home-"));

    try {
      await mkdir(join(home, ".claude"), { recursive: true });
      await mkdir(join(home, ".cursor"), { recursive: true });
      await writeFile(join(home, ".claude", "settings.json"), "{}", "utf8");
      await writeFile(join(home, ".cursor", "mcp.json"), "{}", "utf8");
      await writeFile(join(root, "vault", "shared", "agents", "claude-code.md"), `---\nid: "claude-code"\ntype: agent\nname: "Claude Code"\nrole: "implementation"\nroles: ["implementation"]\nprovider: "claude"\nmodel: "claude-sonnet-4-6"\ncapabilities: []\ntask_types_accepted: []\napproval_required_for: []\ncannot_do: []\naccessible_by: []\nskill_file: "skills/claude-code.md"\nstatus: "available"\nworkspace_id: "ws-demo"\ncreated_at: "2026-04-25T00:00:00Z"\nupdated_at: "2026-04-25T00:00:00Z"\n---\n`, "utf8");

      const response = await scanAgents({ vaultRoot: root, homeDirectory: home });

      expect(response.discovered).toHaveLength(7);
      expect(response.discovered).toEqual(expect.arrayContaining([
        {
          id: "claude-code",
          name: "Claude Code",
          detected: true,
          alreadyRegistered: true,
          configPath: join(home, ".claude", "settings.json"),
          snippet: expect.objectContaining({
            configFilePath: join(home, ".claude", "settings.json"),
          }),
        },
        {
          id: "cursor",
          name: "Cursor",
          detected: true,
          alreadyRegistered: false,
          configPath: join(home, ".cursor", "mcp.json"),
          snippet: expect.objectContaining({
            configFilePath: join(home, ".cursor", "mcp.json"),
          }),
        },
        {
          id: "copilot",
          name: "Copilot",
          detected: false,
          alreadyRegistered: false,
          configPath: join(home, ".copilot", "mcp-config.json"),
          snippet: expect.objectContaining({
            configFilePath: join(home, ".copilot", "mcp-config.json"),
          }),
        },
      ]));
    } finally {
      await Promise.all([
        rm(root, { recursive: true, force: true }),
        rm(home, { recursive: true, force: true }),
      ]);
    }
  });
});
