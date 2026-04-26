import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../../models/read-model";
import type { AgentSessionFullResponse } from "../session.get";
import { computeBootstrapEtag, readTaskBootstrapPack } from "./[taskId].get";
import { readAgentSession } from "../session.get";

function createTask(id: string, overrides: Partial<VaultReadModel["tasks"][number]> = {}): VaultReadModel["tasks"][number] {
  return {
    id,
    type: "task",
    workspaceId: "ws-demo",
    projectId: "project-demo",
    boardId: "board-demo",
    columnId: "in-progress",
    status: "in-progress",
    priority: "high",
    title: `Task ${id}`,
    assignee: "agent-claude-code",
    createdBy: "@alice",
    createdAt: "2026-04-19T09:00:00Z",
    updatedAt: "2026-04-19T09:00:00Z",
    heartbeatAt: null,
    executionStartedAt: null,
    executionNotes: null,
    progress: 25,
    approvalNeeded: false,
    approvalRequestedBy: null,
    approvalReason: null,
    approvedBy: null,
    approvedAt: null,
    approvalOutcome: "pending",
    blockedReason: null,
    blockedSince: null,
    result: null,
    completedAt: null,
    parentTaskId: null,
    dependsOn: [],
    tags: [],
    links: [],
    lockedBy: null,
    lockedAt: null,
    lockExpiresAt: null,
    isStale: false,
    approvalIds: [],
    approvalState: {
      status: "not-needed",
      needed: false,
      outcome: "pending",
      requestedBy: null,
      requestedAt: null,
      decidedBy: null,
      decidedAt: null,
      reason: null,
    },
    body: "",
    sourcePath: `vault/shared/tasks/${id}.md`,
    ...overrides,
  };
}

function createFixtureReadModel(): VaultReadModel {
  const objective = "A".repeat(520);
  const primaryTask = createTask("task-primary", {
    title: "Ship the bootstrap endpoint",
    priority: "critical",
    progress: 60,
    approvalNeeded: true,
    approvalIds: ["approval-primary"],
    approvalState: {
      status: "pending",
      needed: true,
      outcome: "pending",
      requestedBy: "@alice",
      requestedAt: "2026-04-19T10:00:00Z",
      decidedBy: null,
      decidedAt: null,
      reason: "Need sign-off before merge",
    },
    body: `${objective}\n\n## Acceptance Criteria\n- Return a compact bootstrap pack\n- Bound related tasks to five items\n\n## Constraints\n- Do not leak raw vault bodies\n- Use API mutations only`,
  });

  const relatedTasks = Array.from({ length: 6 }, (_, index) =>
    createTask(`task-related-${index + 1}`, {
      title: `Related task ${index + 1}`,
      status: index % 2 === 0 ? "todo" : "in-progress",
      updatedAt: `2026-04-19T1${index}:00:00Z`,
    })
  );

  return {
    workspaces: [{
      id: "ws-demo",
      type: "workspace",
      name: "Demo Workspace",
      ownerIds: ["@alice"],
      memberIds: ["@alice"],
      projectIds: ["project-demo"],
      boardIds: ["board-demo"],
      columnIds: ["in-progress"],
      taskIds: [primaryTask.id, ...relatedTasks.map((task) => task.id)],
      approvalIds: ["approval-primary"],
      createdAt: "2026-04-19T09:00:00Z",
      updatedAt: "2026-04-19T09:00:00Z",
      body: "workspace body",
      sourcePath: "vault/shared/workspaces/ws-demo.md",
    }],
    projects: [{
      id: "project-demo",
      type: "project",
      workspaceId: "ws-demo",
      name: "Demo Project",
      description: null,
      budget: null,
      deadline: null,
      status: null,
      links: [],
      attachments: [],
      codebases: [],
      boardIds: ["board-demo"],
      columnIds: ["in-progress"],
      taskIds: [primaryTask.id, ...relatedTasks.map((task) => task.id)],
      approvalIds: ["approval-primary"],
      createdAt: "2026-04-19T09:00:00Z",
      updatedAt: "2026-04-19T09:00:00Z",
      body: "project body",
      sourcePath: "vault/shared/projects/project-demo.md",
    }],
    boards: [{
      id: "board-demo",
      type: "board",
      workspaceId: "ws-demo",
      projectId: "project-demo",
      name: "Demo Board",
      columnIds: ["in-progress"],
      taskIds: [primaryTask.id, ...relatedTasks.map((task) => task.id)],
      approvalIds: ["approval-primary"],
      createdAt: "2026-04-19T09:00:00Z",
      updatedAt: "2026-04-19T09:00:00Z",
      body: "board body",
      sourcePath: "vault/shared/boards/board-demo.md",
    }],
    columns: [{
      id: "in-progress",
      type: "column",
      workspaceId: "ws-demo",
      projectId: "project-demo",
      boardId: "board-demo",
      name: "In Progress",
      position: 20,
      taskIds: [primaryTask.id, ...relatedTasks.map((task) => task.id)],
      createdAt: "2026-04-19T09:00:00Z",
      updatedAt: "2026-04-19T09:00:00Z",
      body: "column body",
      sourcePath: "vault/shared/columns/in-progress.md",
    }],
    tasks: [primaryTask, ...relatedTasks],
    approvals: [{
      id: "approval-primary",
      type: "approval",
      workspaceId: "ws-demo",
      projectId: "project-demo",
      boardId: "board-demo",
      taskId: "task-primary",
      status: "requested",
      outcome: "pending",
      requestedBy: "@alice",
      requestedAt: "2026-04-19T10:00:00Z",
      decidedBy: null,
      decidedAt: null,
      reason: "Need sign-off before merge",
      createdAt: "2026-04-19T10:00:00Z",
      updatedAt: "2026-04-19T10:00:00Z",
      body: "approval body",
      sourcePath: "vault/shared/approvals/approval-primary.md",
    }],
    auditNotes: [],

    docs: [],
    agents: [],
  };
}

describe("GET /api/agent/bootstrap/:taskId", () => {
  test("returns a compact bootstrap pack for a known task", async () => {
    const response = await readTaskBootstrapPack("task-primary", {
      readModelReader: async () => createFixtureReadModel(),
      resolveRoot: () => "/tmp/relayhq-vault",
      workspaceIdReader: () => null,
    });

    expect(response.task).toEqual({
      id: "task-primary",
      title: "Ship the bootstrap endpoint",
      status: "in-progress",
      column: "in-progress",
      priority: "critical",
      assignee: "agent-claude-code",
      progress: 60,
      boardId: "board-demo",
      projectId: "project-demo",
    });
    expect(response.workspace).toEqual({ id: "ws-demo", name: "Demo Workspace" });
    expect(response.project).toEqual({ id: "project-demo", name: "Demo Project" });
    expect(response.board).toEqual({ id: "board-demo", name: "Demo Board" });
    expect(response.acceptanceCriteria).toEqual([
      "Return a compact bootstrap pack",
      "Bound related tasks to five items",
    ]);
    expect(response.constraints).toEqual([
      "Do not leak raw vault bodies",
      "Use API mutations only",
    ]);
    expect(response.contextFiles).toEqual([]);
    expect(response.contextFileContents).toBeNull();
    expect(response.dependsOn).toEqual([]);
    expect(response.pendingApprovals).toEqual([
      {
        id: "approval-primary",
        reason: "Need sign-off before merge",
        requestedAt: "2026-04-19T10:00:00Z",
      },
    ]);
    expect(response.approvalPolicy).toEqual({
      required: true,
      reason: "Need sign-off before merge",
    });
    expect(response.etag).toBe("task-primary:2026-04-19T09:00:00Z:in-progress:60");
    expect(response.protocolInstructions).not.toBeNull();
    expect(response.protocolInstructions!.length).toBeGreaterThan(0);
    expect(response.objective).toHaveLength(500);
    expect(response.relatedTasks).toHaveLength(5);
    expect(response.relatedTasks.some((task) => task.id === "task-primary")).toBe(false);
  });

  test("resolves dependsOn summaries and parses context files", async () => {
    const baseReadModel = createFixtureReadModel();
    const primaryTask = {
      ...baseReadModel.tasks[0],
      dependsOn: ["task-related-1", "task-missing"],
      body: `${baseReadModel.tasks[0]!.body}\n\n## Context Files\n- app/server/api/agent/bootstrap/[taskId].get.ts\n- app/server/api/agent/tasks.post.ts`,
    };
    const readModel = {
      ...baseReadModel,
      tasks: [primaryTask, ...baseReadModel.tasks.slice(1)],
    };

    const response = await readTaskBootstrapPack("task-primary", {
      readModelReader: async () => readModel,
      resolveRoot: () => "/tmp/relayhq-vault",
      workspaceIdReader: () => null,
    });

    expect(response.dependsOn).toEqual([
      {
        id: "task-related-1",
        title: "Related task 1",
        status: "todo",
      },
    ]);
    expect(response.contextFiles).toEqual([
      "app/server/api/agent/bootstrap/[taskId].get.ts",
      "app/server/api/agent/tasks.post.ts",
    ]);
    expect(response.contextFileContents).toBeNull();
  });

  test("inlines context file contents with caps and safe path guards", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-bootstrap-inline-"));
    try {
      await mkdir(join(root, "app", "server", "api", "agent"), { recursive: true });
      await writeFile(join(root, "app", "server", "api", "agent", "alpha.ts"), "A".repeat(5000), "utf8");
      await writeFile(join(root, "app", "server", "api", "agent", "beta.ts"), "B".repeat(15000), "utf8");

      const baseReadModel = createFixtureReadModel();
      const primaryTask = {
        ...baseReadModel.tasks[0],
        body: `Inline files\n\n## Context Files\n- app/server/api/agent/alpha.ts\n- app/server/api/agent/missing.ts\n- /etc/passwd\n- ../outside.txt\n- app/server/api/agent/beta.ts`,
      };

      const response = await readTaskBootstrapPack("task-primary", {
        inlineContextFiles: true,
        readModelReader: async () => ({
          ...baseReadModel,
          tasks: [primaryTask, ...baseReadModel.tasks.slice(1)],
        }),
        resolveRoot: () => root,
        workspaceIdReader: () => null,
      });

      expect(response.contextFileContents).not.toBeNull();
      expect(Object.keys(response.contextFileContents ?? {})).toContain("app/server/api/agent/alpha.ts");
      expect(response.contextFileContents?.["app/server/api/agent/alpha.ts"]).toHaveLength(4000);
      expect(response.contextFileContents?.["app/server/api/agent/missing.ts"]).toBe("[file not found]");
      expect(Object.keys(response.contextFileContents ?? {})).not.toContain("/etc/passwd");
      expect(Object.keys(response.contextFileContents ?? {})).not.toContain("../outside.txt");
      expect(response.contextFileContents?.["app/server/api/agent/beta.ts"]?.length ?? 0).toBeLessThanOrEqual(11984);
      expect(Object.values(response.contextFileContents ?? {}).join("").length).toBeLessThanOrEqual(16000);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("omits protocol instructions when includeProtocol is false", async () => {
    const response = await readTaskBootstrapPack("task-primary", {
      includeProtocol: false,
      readModelReader: async () => createFixtureReadModel(),
      resolveRoot: () => "/tmp/relayhq-vault",
      workspaceIdReader: () => null,
    });

    expect(response.protocolInstructions).toBeNull();
    expect(response.etag).toBeDefined();
    expect(response.task.id).toBe("task-primary");
    expect(response.contextFileContents).toBeNull();
  });

  test("session helper propagates inline bootstrap file contents", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-session-inline-"));
    try {
      await mkdir(join(root, "app", "server", "api", "agent"), { recursive: true });
      await writeFile(join(root, "app", "server", "api", "agent", "session.ts"), "session context", "utf8");

      const baseReadModel = createFixtureReadModel();
      const primaryTask = {
        ...baseReadModel.tasks[0],
        body: `Inline session\n\n## Context Files\n- app/server/api/agent/session.ts`,
      };
      const readModel = {
        ...baseReadModel,
        tasks: [primaryTask, ...baseReadModel.tasks.slice(1)],
      };

      const response = await readAgentSession({
        agent: "agent-claude-code",
        taskId: "task-primary",
        inlineContextFiles: true,
      }, {
        readModelReader: async () => readModel,
        resolveRoot: () => root,
        workspaceIdReader: () => null,
      });
      const fullResponse = response as AgentSessionFullResponse;

      expect(fullResponse.bootstrap).not.toBeNull();
      expect("contextFileContents" in (fullResponse.bootstrap ?? {})).toBe(true);
      expect((fullResponse.bootstrap as Exclude<typeof fullResponse.bootstrap, null | { changed: false; etag: string }>).contextFileContents).toEqual({
        "app/server/api/agent/session.ts": "session context",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("computeBootstrapEtag produces deterministic string from task fields", () => {
    const etag = computeBootstrapEtag({
      id: "task-x",
      updatedAt: "2026-04-19T10:00:00Z",
      status: "done",
      progress: 100,
    });
    expect(etag).toBe("task-x:2026-04-19T10:00:00Z:done:100");
  });

  test("returns 404 when the task does not exist", async () => {
    await expect(readTaskBootstrapPack("task-missing", {
      readModelReader: async () => createFixtureReadModel(),
      resolveRoot: () => "/tmp/relayhq-vault",
      workspaceIdReader: () => null,
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  test("ignores stale workspace filters that do not match the current read-model", async () => {
    const response = await readTaskBootstrapPack("task-primary", {
      readModelReader: async () => createFixtureReadModel(),
      resolveRoot: () => "/tmp/relayhq-vault",
      workspaceIdReader: () => "ws-other",
    });

    expect(response.task.id).toBe("task-primary");
  });
});
