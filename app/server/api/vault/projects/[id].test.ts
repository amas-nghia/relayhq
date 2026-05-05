import { readdir, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { deleteProject, readProjectById, updateProjectMetadata } from "./[id]";

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
  await mkdir(join(root, "vault", "shared", "tasks"), { recursive: true });
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
  test("GET /api/vault/projects/[id] returns project metadata, docs, and active status", async () => {
    const root = await createRoot();
    await mkdir(join(root, "vault", "shared", "docs"), { recursive: true });
    await writeFile(join(root, "vault", "shared", "tasks", "task-open.md"), [
      "---",
      'id: "task-open"',
      'type: "task"',
      'version: 1',
      'workspace_id: "ws-demo"',
      'project_id: "project-demo"',
      'board_id: "board-demo"',
      'column: "todo"',
      'status: "in-progress"',
      'priority: "high"',
      'title: "Ship release tests"',
      'assignee: "mary"',
      'created_by: "@owner"',
      'created_at: "2026-04-23T00:00:00Z"',
      'updated_at: "2026-04-23T02:00:00Z"',
      'heartbeat_at: null',
      'execution_started_at: "2026-04-23T01:00:00Z"',
      'execution_notes: null',
      'progress: 50',
      'next_run_at: null',
      'approval_needed: false',
      'approval_requested_by: null',
      'approval_reason: null',
      'approved_by: null',
      'approved_at: null',
      'approval_outcome: "pending"',
      'blocked_reason: null',
      'blocked_since: null',
      'result: null',
      'completed_at: null',
      'parent_task_id: null',
      'depends_on: []',
      'tags: []',
      'links: []',
      'locked_by: null',
      'locked_at: null',
      'lock_expires_at: null',
      'approval_ids: []',
      "---",
      "",
    ].join("\n"), "utf8");
    await writeFile(join(root, "vault", "shared", "docs", "doc-project.md"), [
      "---",
      'id: "doc-project"',
      'type: "doc"',
      'doc_type: "feature"',
      'workspace_id: "ws-demo"',
      'project_id: "project-demo"',
      'title: "Project doc"',
      'status: "active"',
      'visibility: "workspace"',
      'access_roles: ["all"]',
      'sensitive: false',
      'created_at: "2026-04-23T00:00:00Z"',
      'updated_at: "2026-04-23T03:00:00Z"',
      'tags: ["release"]',
      "---",
      "# Project doc",
    ].join("\n"), "utf8");

    const response = await readProjectById("project-demo", { vaultRoot: root });

    expect(response).toEqual({
      id: "project-demo",
      name: "Demo Project",
      boardId: "board-demo",
      coordinatorAgentId: null,
      lastActive: true,
      codebaseRoot: null,
      description: "Original description",
      budget: null,
      deadline: null,
      status: null,
      scene: null,
      links: [],
      attachments: [],
      docs: [{
        id: "doc-project",
        title: "Project doc",
        docType: "feature",
        status: "active",
        visibility: "workspace",
        updatedAt: "2026-04-23T03:00:00Z",
        sourcePath: "vault/shared/docs/doc-project.md",
      }],
    });
  });

  test("GET /api/vault/projects/[id] returns 404 for missing projects", async () => {
    const root = await createRoot();
    await expect(readProjectById("project-missing", { vaultRoot: root })).rejects.toMatchObject({ statusCode: 404 });
  });

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

  test("GET /api/vault/projects/[id] returns docs, activity, and codebase summary", async () => {
    const root = await createRoot();
    await mkdir(join(root, "vault", "shared", "docs"), { recursive: true });
    await mkdir(join(root, "vault", "shared", "tasks"), { recursive: true });
    await writeFile(join(root, "vault", "shared", "docs", "doc-plan.md"), [
      "---",
      'id: "doc-plan"',
      'type: "doc"',
      'doc_type: "plan"',
      'workspace_id: "ws-demo"',
      'project_id: "project-demo"',
      'title: "Project plan"',
      'status: "published"',
      'visibility: "project"',
      'access_roles: ["all"]',
      'sensitive: false',
      'created_at: "2026-04-23T00:00:00Z"',
      'updated_at: "2026-04-24T00:00:00Z"',
      'tags: ["plan"]',
      "---",
      "Plan",
    ].join("\n"), "utf8");
    await writeFile(join(root, "vault", "shared", "tasks", "task-active.md"), [
      "---",
      'id: "task-active"',
      'type: "task"',
      'workspace_id: "ws-demo"',
      'project_id: "project-demo"',
      'board_id: "board-demo"',
      'column: "in-progress"',
      'status: "in-progress"',
      'priority: "high"',
      'title: "Ship release"',
      'assignee: "agent-claude-code"',
      'created_by: "@owner"',
      'created_at: "2026-04-23T00:00:00Z"',
      'updated_at: "2026-04-24T00:00:00Z"',
      'approval_outcome: "pending"',
      'depends_on: []',
      'tags: []',
      'links: []',
      "---",
      "",
    ].join("\n"), "utf8");

    const response = await readProjectById("project-demo", { vaultRoot: root });
    expect(response).toEqual({
      id: "project-demo",
      name: "Demo Project",
      boardId: "board-demo",
      coordinatorAgentId: null,
      lastActive: true,
      codebaseRoot: null,
      description: "Original description",
      budget: null,
      deadline: null,
      status: null,
      scene: null,
      links: [],
      attachments: [],
      docs: [
        {
          id: "doc-plan",
          title: "Project plan",
          docType: "plan",
          status: "published",
          visibility: "project",
          updatedAt: "2026-04-24T00:00:00Z",
          sourcePath: "vault/shared/docs/doc-plan.md",
        },
      ],
    });
  });

  test("GET /api/vault/projects/[id] returns 404 for missing projects", async () => {
    const root = await createRoot();
    await expect(readProjectById("missing-project", { vaultRoot: root })).rejects.toMatchObject({ statusCode: 404 });
  });

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
