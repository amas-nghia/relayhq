import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { readSharedVaultCollections } from "../../services/vault/read";

import { registerVaultAgent } from "./agents.post";

async function createWorkspaceRoot(workspaces: ReadonlyArray<{ id: string; name: string }>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `relayhq-agent-create-${randomUUID()}-`));
  const workspaceDirectory = join(root, "vault", "shared", "workspaces");
  await mkdir(workspaceDirectory, { recursive: true });

  await Promise.all(workspaces.map((workspace) => writeFile(
    join(workspaceDirectory, `${workspace.id}.md`),
    [
      "---",
      `id: ${workspace.id}`,
      "type: workspace",
      `name: ${JSON.stringify(workspace.name)}`,
      'owner_ids: ["@owner"]',
      'member_ids: ["@owner"]',
      'created_at: "2026-04-19T10:00:00Z"',
      'updated_at: "2026-04-19T10:00:00Z"',
      "---",
      "",
    ].join("\n"),
    "utf8",
  )));

  return root;
}

describe("POST /api/vault/agents", () => {
  test("creates a vault agent document with valid frontmatter", async () => {
    const root = await createWorkspaceRoot([{ id: "ws-demo", name: "Demo Workspace" }]);

    try {
      const response = await registerVaultAgent(
        {
          name: "Backend Developer",
          role: "backend-developer",
          model: "claude-sonnet-4-6",
          provider: "anthropic",
        },
        { vaultRoot: root, env: { ...process.env, RELAYHQ_WORKSPACE_ID: "ws-demo" } },
      );

      expect(response).toEqual({
        agent: expect.objectContaining({
          id: "backend-developer",
          type: "agent",
          name: "Backend Developer",
          role: "backend-developer",
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          capabilities: [],
          task_types_accepted: [],
          approval_required_for: [],
          cannot_do: [],
          accessible_by: [],
          skill_file: "skills/backend-developer.md",
          status: "available",
          workspace_id: "ws-demo",
        }),
        sourcePath: "vault/shared/agents/backend-developer.md",
      });

      await expect(readFile(join(root, response.sourcePath), "utf8")).resolves.toContain('id: "backend-developer"');
      await expect(readFile(join(root, response.sourcePath), "utf8")).resolves.toContain('type: agent');

      const collections = await readSharedVaultCollections(root);
      expect(collections.agents).toEqual([
        expect.objectContaining({
          sourcePath: "vault/shared/agents/backend-developer.md",
          frontmatter: expect.objectContaining({
            id: "backend-developer",
            workspace_id: "ws-demo",
          }),
        }),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("returns 409 when a duplicate agent id already exists", async () => {
    const root = await createWorkspaceRoot([{ id: "ws-demo", name: "Demo Workspace" }]);
    const request = {
      name: "Backend Developer",
      role: "backend-developer",
      model: "claude-sonnet-4-6",
      provider: "anthropic",
    };

    try {
      await registerVaultAgent(request, { vaultRoot: root });

      await expect(registerVaultAgent(request, { vaultRoot: root })).rejects.toMatchObject({
        statusCode: 409,
        statusMessage: "Agent backend-developer already exists.",
      });

      await expect(readFile(join(root, "vault/shared/agents/backend-developer.md"), "utf8")).resolves.toContain('role: "backend-developer"');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
