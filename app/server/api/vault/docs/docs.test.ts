import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { listVaultDocs } from "./index.get";
import { createVaultDoc } from "./index.post";
import { updateVaultDoc } from "./[id].patch";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "relayhq-doc-api-"));
  roots.push(root);
  await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "docs"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "workspaces", "ws-demo.md"), [
    "---",
    'id: "ws-demo"',
    'type: "workspace"',
    'name: "Demo Workspace"',
    'owner_ids: ["@owner"]',
    'member_ids: ["@owner"]',
    'created_at: "2026-04-24T00:00:00Z"',
    'updated_at: "2026-04-24T00:00:00Z"',
    "---",
    "",
  ].join("\n"), "utf8");
  return root;
}

describe("vault docs API", () => {
  test("POST /api/vault/docs creates a canonical doc file", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    try {
      const response = await createVaultDoc({
        title: "Feature Overview",
        doc_type: "feature",
        project_id: "project-demo",
        visibility: "workspace",
        access_roles: ["role:pm"],
        tags: ["vault", "docs"],
        body: "# Feature Overview",
      }, { vaultRoot: root, now: new Date("2026-04-24T00:00:00Z") });

      expect(response.success).toBe(true);
      const docId = response.data.id;
      const file = await readFile(join(root, "vault", "shared", "docs", `${docId}.md`), "utf8");
      expect(docId).toMatch(/^doc-/);
      expect(file).toContain('doc_type: "feature"');
      expect(file).toContain('visibility: "workspace"');
      expect(file).toContain('access_roles: ["role:pm"]');
      expect(file).toContain('sensitive: false');
      expect(file).toContain('# Feature Overview');
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
    }
  });

  test("PATCH /api/vault/docs/[id] updates metadata and body", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    try {
      await writeFile(join(root, "vault", "shared", "docs", "doc-abc12345.md"), [
        "---",
        'id: "doc-abc12345"',
        'type: "doc"',
        'doc_type: "feature"',
        'workspace_id: "ws-demo"',
        'project_id: "project-demo"',
        'title: "Old Title"',
        'status: "draft"',
        'visibility: "project"',
        'access_roles: ["all"]',
        'sensitive: false',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T00:00:00Z"',
        'tags: ["vault"]',
        "---",
        "Old body",
      ].join("\n"), "utf8");

      const response = await updateVaultDoc("doc-abc12345", {
        patch: {
          title: "New Title",
          doc_type: "design",
          status: "active",
          visibility: "private",
          access_roles: ["agent-claude-code"],
          sensitive: true,
          tags: ["vault", "design"],
          body: "New body",
        },
      }, { vaultRoot: root, now: new Date("2026-04-24T01:00:00Z") });

      expect(response.success).toBe(true);
      expect(response.data.title).toBe("New Title");
      expect(response.data.doc_type).toBe("design");
      expect(response.data.status).toBe("active");
      expect(response.data.visibility).toBe("private");
      expect(response.data.access_roles).toEqual(["agent-claude-code"]);
      expect(response.data.sensitive).toBe(true);
      expect(response.data.body).toBe("New body");

      const file = await readFile(join(root, "vault", "shared", "docs", "doc-abc12345.md"), "utf8");
      expect(file).toContain('title: "New Title"');
      expect(file).toContain('doc_type: "design"');
      expect(file).toContain('status: "active"');
      expect(file).toContain('visibility: "private"');
      expect(file).toContain('access_roles: ["agent-claude-code"]');
      expect(file).toContain('sensitive: true');
      expect(file).toContain('tags: ["design","vault"]');
      expect(file).toContain('New body');
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
    }
  });

  test("GET /api/vault/docs filters access=mine for agents", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    try {
      await writeFile(join(root, "vault", "shared", "docs", "doc-open.md"), [
        "---",
        'id: "doc-open"',
        'type: "doc"',
        'doc_type: "brief"',
        'workspace_id: "ws-demo"',
        'project_id: "project-demo"',
        'title: "Open doc"',
        'status: "draft"',
        'visibility: "project"',
        'access_roles: ["all"]',
        'sensitive: false',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T00:00:00Z"',
        'tags: ["docs"]',
        "---",
        "Visible",
      ].join("\n"), "utf8");
      await writeFile(join(root, "vault", "shared", "docs", "doc-human.md"), [
        "---",
        'id: "doc-human"',
        'type: "doc"',
        'doc_type: "policy"',
        'workspace_id: "ws-demo"',
        'project_id: "project-demo"',
        'title: "Human doc"',
        'status: "active"',
        'visibility: "workspace"',
        'access_roles: ["human-only"]',
        'sensitive: false',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T00:00:00Z"',
        'tags: ["ops"]',
        "---",
        "Hidden",
      ].join("\n"), "utf8");
      await mkdir(join(root, "vault", "shared", "agents"), { recursive: true });
      await writeFile(join(root, "vault", "shared", "agents", "agent-claude-code.md"), [
        "---",
        'id: "agent-claude-code"',
        'type: "agent"',
        'name: "Claude Code"',
        'role: "implementation"',
        'roles: ["implementation"]',
        'provider: "claude"',
        'model: "claude-sonnet-4-6"',
        'capabilities: []',
        'task_types_accepted: []',
        'approval_required_for: []',
        'cannot_do: []',
        'accessible_by: []',
        'skill_file: "skills/claude-code.md"',
        'status: "available"',
        'workspace_id: "ws-demo"',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T00:00:00Z"',
        "---",
      ].join("\n"), "utf8");

      const response = await listVaultDocs({ access: "mine", agent_id: "agent-claude-code" }, { vaultRoot: root });
      expect(response.data.map((doc) => doc.id)).toContain("doc-open");
      expect(response.data.map((doc) => doc.id)).not.toContain("doc-human");
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
    }
  });
});
