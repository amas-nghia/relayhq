import { readdir, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { deleteProject, updateProjectMetadata } from "./[id]";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "relayhq-project-update-"));
  roots.push(root);
  await mkdir(join(root, "vault", "shared", "projects"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "boards"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "columns"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "audit"), { recursive: true });
  await writeFile(join(root, "vault", "shared", "projects", "project-demo.md"), [
    "---",
    'id: "project-demo"',
    'type: "project"',
    'workspace_id: "ws-demo"',
    'name: "Demo Project"',
    'codebases: []',
    'created_at: "2026-04-23T00:00:00Z"',
    'updated_at: "2026-04-23T00:00:00Z"',
    "---",
    "# Demo Project",
    "",
    "## Description",
    "Original description",
    "",
    "## Status",
    "Active",
    "",
  ].join("\n"), "utf8");
  await writeFile(join(root, "vault", "shared", "boards", "board-demo.md"), [
    "---",
    'id: "board-demo"',
    'type: "board"',
    'workspace_id: "ws-demo"',
    'project_id: "project-demo"',
    'name: "Demo Board"',
    'created_at: "2026-04-23T00:00:00Z"',
    'updated_at: "2026-04-23T00:00:00Z"',
    "---",
    "",
  ].join("\n"), "utf8");
  await writeFile(join(root, "vault", "shared", "columns", "column-demo.md"), [
    "---",
    'id: "column-demo"',
    'type: "column"',
    'workspace_id: "ws-demo"',
    'project_id: "project-demo"',
    'board_id: "board-demo"',
    'name: "Todo"',
    'position: 0',
    'created_at: "2026-04-23T00:00:00Z"',
    'updated_at: "2026-04-23T00:00:00Z"',
    "---",
    "",
  ].join("\n"), "utf8");
  return root;
}

describe("PATCH /api/vault/projects/[id]", () => {
  test("updates project metadata and writes an audit note", async () => {
    const root = await createRoot();
    const response = await updateProjectMetadata("project-demo", {
      actorId: "agent-claude-code",
      patch: {
        name: "Renamed Project",
        description: "New description",
        budget: "$12,000/mo",
        deadline: "2026-06-01T00:00:00Z",
        status: "Paused",
        links: [{ label: "PRD", url: "https://notion.so/prd" }],
        attachments: [{ label: "Kickoff doc", url: "https://drive.google.com/doc", type: "doc", addedAt: "2026-04-24T00:00:00Z" }],
        scene: { background: { mode: "gradient", gradientFrom: "#1f2937", gradientTo: "#0f172a" } },
        codebases: [{ name: "frontend", path: "../repo", tech: "Nuxt", primary: true }],
      },
    }, { vaultRoot: root });

    expect(response).toEqual({
      id: "project-demo",
      name: "Renamed Project",
      coordinatorAgentId: null,
      budget: "$12,000/mo",
      deadline: "2026-06-01T00:00:00Z",
      links: [{ label: "PRD", url: "https://notion.so/prd" }],
      attachments: [{ label: "Kickoff doc", url: "https://drive.google.com/doc", type: "doc", addedAt: "2026-04-24T00:00:00Z" }],
      scene: { background: { mode: "gradient", gradientFrom: "#1f2937", gradientTo: "#0f172a" } },
      codebases: [{ name: "frontend", path: "../repo", tech: "Nuxt", primary: true }],
      description: "New description",
      status: "paused",
    });

    const projectDocument = await readFile(join(root, "vault", "shared", "projects", "project-demo.md"), "utf8");
    expect(projectDocument).toContain('name: "Renamed Project"');
    expect(projectDocument).toContain('budget: "$12,000/mo"');
    expect(projectDocument).toContain('deadline: "2026-06-01T00:00:00Z"');
    expect(projectDocument).toContain('links: [{"label":"PRD","url":"https://notion.so/prd"}]');
    expect(projectDocument).toContain('attachments: [{"label":"Kickoff doc","url":"https://drive.google.com/doc","type":"doc","addedAt":"2026-04-24T00:00:00Z"}]');
    expect(projectDocument).toContain('scene: {"background":{"mode":"gradient","gradientFrom":"#1f2937","gradientTo":"#0f172a"}}');
    expect(projectDocument).toContain('codebases: [{"name":"frontend","path":"../repo","tech":"Nuxt","primary":true}]');
    expect(projectDocument).toContain("## Description\nNew description");

    const auditFiles = await readdir(join(root, "vault", "shared", "audit"));
    expect(auditFiles).toHaveLength(1);
    const auditDocument = await readFile(join(root, "vault", "shared", "audit", auditFiles[0]!), "utf8");
    expect(auditDocument).toContain("Updated project metadata for Renamed Project");
  });

  test("rejects empty names in patch payload", async () => {
    const root = await createRoot();

    await expect(updateProjectMetadata("project-demo", {
      actorId: "agent-claude-code",
      patch: { name: "   " },
    }, { vaultRoot: root })).rejects.toMatchObject({ statusCode: 400 });
  });

  test("assigns a coordinator agent when the agent has the coordinator role", async () => {
    const root = await createRoot();
    await mkdir(join(root, "vault", "shared", "agents"), { recursive: true });
    await mkdir(join(root, "vault", "shared", "tasks"), { recursive: true });
    await writeFile(join(root, "vault", "shared", "agents", "agent-coordinator.md"), [
      "---",
      'id: "agent-coordinator"',
      'type: "agent"',
      'name: "Coordinator"',
      'role: "coordinator"',
      'roles: ["coordinator"]',
      'provider: "anthropic"',
      'model: "claude-sonnet-4-6"',
      'capabilities: []',
      'task_types_accepted: []',
      'approval_required_for: []',
      'cannot_do: []',
      'accessible_by: []',
      'skill_file: "skills/coordinator.md"',
      'status: "available"',
      'workspace_id: "ws-demo"',
      'created_at: "2026-04-23T00:00:00Z"',
      'updated_at: "2026-04-23T00:00:00Z"',
      "---",
      "",
    ].join("\n"), "utf8");

    const response = await updateProjectMetadata("project-demo", {
      actorId: "agent-claude-code",
      patch: { coordinator_agent_id: "agent-coordinator" },
    }, { vaultRoot: root });

    expect(response.coordinatorAgentId).toBe("agent-coordinator");

    const projectDocument = await readFile(join(root, "vault", "shared", "projects", "project-demo.md"), "utf8");
    expect(projectDocument).toContain('coordinator_agent_id: "agent-coordinator"');
  });

  test("rejects coordinator agents without the coordinator role", async () => {
    const root = await createRoot();
    await mkdir(join(root, "vault", "shared", "agents"), { recursive: true });
    await writeFile(join(root, "vault", "shared", "agents", "agent-worker.md"), [
      "---",
      'id: "agent-worker"',
      'type: "agent"',
      'name: "Worker"',
      'role: "implementation"',
      'roles: ["implementation"]',
      'provider: "anthropic"',
      'model: "claude-sonnet-4-6"',
      'capabilities: []',
      'task_types_accepted: []',
      'approval_required_for: []',
      'cannot_do: []',
      'accessible_by: []',
      'skill_file: "skills/worker.md"',
      'status: "available"',
      'workspace_id: "ws-demo"',
      'created_at: "2026-04-23T00:00:00Z"',
      'updated_at: "2026-04-23T00:00:00Z"',
      "---",
      "",
    ].join("\n"), "utf8");

    await expect(updateProjectMetadata("project-demo", {
      actorId: "agent-claude-code",
      patch: { coordinator_agent_id: "agent-worker" },
    }, { vaultRoot: root })).rejects.toMatchObject({ statusCode: 400 })
  })

  test("deletes the project and related board and column files", async () => {
    const root = await createRoot();

    const response = await deleteProject("project-demo", { vaultRoot: root });
    expect(response.success).toBe(true);
    expect(response.deletedPaths).toHaveLength(3);

    await expect(readFile(join(root, "vault", "shared", "projects", "project-demo.md"), "utf8")).rejects.toThrow();
    await expect(readFile(join(root, "vault", "shared", "boards", "board-demo.md"), "utf8")).rejects.toThrow();
    await expect(readFile(join(root, "vault", "shared", "columns", "column-demo.md"), "utf8")).rejects.toThrow();
  });

  test("returns 404 when deleting a missing project", async () => {
    const root = await createRoot();
    await expect(deleteProject("missing-project", { vaultRoot: root })).rejects.toMatchObject({ statusCode: 404 });
  });
});
