import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { readVaultDoc } from "./[id].get";
import { listVaultDocs } from "./index.get";
import { createVaultDoc } from "./index.post";
import { readVaultDoc } from "./[id].get";
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

  test("POST /api/vault/docs accepts repo-map and capability-map doc types", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    try {
      const repoMap = await createVaultDoc({
        title: "RelayHQ repo map",
        doc_type: "repo-map",
        tags: ["codebase-brain"],
      }, { vaultRoot: root, now: new Date("2026-04-24T00:00:00Z") });
      const capabilityMap = await createVaultDoc({
        title: "Task lifecycle capability map",
        doc_type: "capability-map",
        tags: ["task-lifecycle"],
      }, { vaultRoot: root, now: new Date("2026-04-24T00:00:00Z") });

      expect(repoMap.data.doc_type).toBe("repo-map");
      expect(capabilityMap.data.doc_type).toBe("capability-map");
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

  test("GET /api/vault/docs returns an empty list for projects without docs", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    try {
      const response = await listVaultDocs({ project_id: "project-missing" }, { vaultRoot: root });
      expect(response).toEqual({ success: true, data: [], error: null });
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
    }
  });

  test("GET /api/vault/docs filters by project and preserves contract shape", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    try {
      await writeFile(join(root, "vault", "shared", "docs", "doc-project-a.md"), [
        "---",
        'id: "doc-project-a"',
        'type: "doc"',
        'doc_type: "feature"',
        'workspace_id: "ws-demo"',
        'project_id: "project-a"',
        'title: "Project A doc"',
        'status: "active"',
        'visibility: "workspace"',
        'access_roles: ["all"]',
        'sensitive: false',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T01:00:00Z"',
        'tags: ["alpha"]',
        "---",
        "Body A",
      ].join("\n"), "utf8");
      await writeFile(join(root, "vault", "shared", "docs", "doc-project-b.md"), [
        "---",
        'id: "doc-project-b"',
        'type: "doc"',
        'doc_type: "design"',
        'workspace_id: "ws-demo"',
        'project_id: "project-b"',
        'title: "Project B doc"',
        'status: "draft"',
        'visibility: "project"',
        'access_roles: ["all"]',
        'sensitive: false',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T02:00:00Z"',
        'tags: ["beta"]',
        "---",
        "Body B",
      ].join("\n"), "utf8");

      const response = await listVaultDocs({ project_id: "project-a" }, { vaultRoot: root });

      expect(response).toEqual({
        success: true,
        data: [{
          id: "doc-project-a",
          title: "Project A doc",
          doc_type: "feature",
          status: "active",
          visibility: "workspace",
          access_roles: ["all"],
          sensitive: false,
          workspace_id: "ws-demo",
          project_id: "project-a",
          updated_at: "2026-04-24T01:00:00Z",
          created_at: "2026-04-24T00:00:00Z",
          tags: ["alpha"],
          sourcePath: "vault/shared/docs/doc-project-a.md",
        }],
        error: null,
      });
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
    }
  });

  test("GET /api/vault/docs/[id] returns the full doc payload", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    try {
      await writeFile(join(root, "vault", "shared", "docs", "doc-read.md"), [
        "---",
        'id: "doc-read"',
        'type: "doc"',
        'doc_type: "brief"',
        'workspace_id: "ws-demo"',
        'project_id: "project-demo"',
        'title: "Readable doc"',
        'status: "active"',
        'visibility: "workspace"',
        'access_roles: ["all"]',
        'sensitive: true',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T03:00:00Z"',
        'tags: ["release","summary"]',
        "---",
        "# Read me",
      ].join("\n"), "utf8");

      const response = await readVaultDoc("doc-read", { vaultRoot: root });
      expect(response).toEqual({
        success: true,
        data: {
          id: "doc-read",
          title: "Readable doc",
          doc_type: "brief",
          status: "active",
          visibility: "workspace",
          access_roles: ["all"],
          sensitive: true,
          workspace_id: "ws-demo",
          project_id: "project-demo",
          created_at: "2026-04-24T00:00:00Z",
          updated_at: "2026-04-24T03:00:00Z",
          tags: ["release", "summary"],
          body: "# Read me",
          sourcePath: "vault/shared/docs/doc-read.md",
        },
        error: null,
      });
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
    }
  });

  test("GET /api/vault/docs/[id] returns 404 for missing docs", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    try {
      await expect(readVaultDoc("doc-missing", { vaultRoot: root })).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
    }
  });

  test("GET /api/vault/docs returns empty state and project-filtered results", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    try {
      await expect(listVaultDocs({}, { vaultRoot: root })).resolves.toEqual({ success: true, data: [], error: null });

      await writeFile(join(root, "vault", "shared", "docs", "doc-alpha.md"), [
        "---",
        'id: "doc-alpha"',
        'type: "doc"',
        'doc_type: "brief"',
        'workspace_id: "ws-demo"',
        'project_id: "project-alpha"',
        'title: "Alpha doc"',
        'status: "draft"',
        'visibility: "project"',
        'access_roles: ["all"]',
        'sensitive: false',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T00:00:00Z"',
        'tags: ["alpha"]',
        "---",
        "Alpha",
      ].join("\n"), "utf8");
      await writeFile(join(root, "vault", "shared", "docs", "doc-beta.md"), [
        "---",
        'id: "doc-beta"',
        'type: "doc"',
        'doc_type: "plan"',
        'workspace_id: "ws-demo"',
        'project_id: "project-beta"',
        'title: "Beta doc"',
        'status: "published"',
        'visibility: "workspace"',
        'access_roles: ["all"]',
        'sensitive: false',
        'created_at: "2026-04-24T01:00:00Z"',
        'updated_at: "2026-04-24T01:00:00Z"',
        'tags: ["beta"]',
        "---",
        "Beta",
      ].join("\n"), "utf8");

      const filtered = await listVaultDocs({ project_id: "project-beta" }, { vaultRoot: root });
      expect(filtered).toEqual({
        success: true,
        data: [
          {
            id: "doc-beta",
            title: "Beta doc",
            doc_type: "plan",
            status: "published",
            visibility: "workspace",
            access_roles: ["all"],
            sensitive: false,
            workspace_id: "ws-demo",
            project_id: "project-beta",
            updated_at: "2026-04-24T01:00:00Z",
            created_at: "2026-04-24T01:00:00Z",
            tags: ["beta"],
            sourcePath: "vault/shared/docs/doc-beta.md",
          },
        ],
        error: null,
      });
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
    }
  });

  test("GET /api/vault/docs/[id] returns a canonical doc and 404s for missing docs", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    try {
      await writeFile(join(root, "vault", "shared", "docs", "doc-brief.md"), [
        "---",
        'id: "doc-brief"',
        'type: "doc"',
        'doc_type: "brief"',
        'workspace_id: "ws-demo"',
        'project_id: "project-demo"',
        'title: "Release brief"',
        'status: "draft"',
        'visibility: "workspace"',
        'access_roles: ["all"]',
        'sensitive: true',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T02:00:00Z"',
        'tags: ["release","brief"]',
        "---",
        "# Release brief",
      ].join("\n"), "utf8");

      await expect(readVaultDoc("doc-brief", { vaultRoot: root })).resolves.toEqual({
        success: true,
        data: {
          id: "doc-brief",
          title: "Release brief",
          doc_type: "brief",
          status: "draft",
          visibility: "workspace",
          access_roles: ["all"],
          sensitive: true,
          workspace_id: "ws-demo",
          project_id: "project-demo",
          created_at: "2026-04-24T00:00:00Z",
          updated_at: "2026-04-24T02:00:00Z",
          tags: ["brief", "release"],
          body: "# Release brief",
          sourcePath: "vault/shared/docs/doc-brief.md",
        },
        error: null,
      });
      await expect(readVaultDoc("doc-missing", { vaultRoot: root })).rejects.toMatchObject({ statusCode: 404 });
    } finally {
      delete process.env.RELAYHQ_VAULT_ROOT;
    }
  });
});
