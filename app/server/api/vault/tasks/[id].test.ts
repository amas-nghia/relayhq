import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { VAULT_SCHEMA_VERSION } from "../../../../shared/vault/schema";
import { patchTaskLifecycle } from "../../../services/vault/task-lifecycle";
import { deleteVaultTask } from "../../../services/vault/task-delete";
import { readTaskDocument, serializeTaskDocument } from "../../../services/vault/write";
import { patchVaultTask } from "./[id]";

async function createVaultRootWithTask() {
  const root = await mkdtemp(join(tmpdir(), "relayhq-vault-patch-task-"));
  const tasksDir = join(root, "vault", "shared", "tasks");
  await mkdir(tasksDir, { recursive: true });
  await writeFile(join(tasksDir, "task-001.md"), serializeTaskDocument({
    id: "task-001",
    type: "task",
    version: VAULT_SCHEMA_VERSION,
    workspace_id: "ws-demo",
    project_id: "project-demo",
    board_id: "board-demo",
    column: "todo",
    status: "todo",
    priority: "high",
    title: "Queue assignment for dispatcher",
    assignee: null,
    created_by: "@alice",
    created_at: "2026-04-15T09:00:00Z",
    updated_at: "2026-04-15T09:00:00Z",
    heartbeat_at: null,
    execution_started_at: null,
    execution_notes: null,
    progress: 0,
    next_run_at: null,
    approval_needed: false,
    approval_requested_by: null,
    approval_reason: null,
    approved_by: null,
    approved_at: null,
    approval_outcome: "pending",
    blocked_reason: null,
    blocked_since: null,
    result: null,
    completed_at: null,
    parent_task_id: null,
    depends_on: [],
    tags: [],
    links: [],
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
  }, "# Task\n"), "utf8");
  return root;
}

describe("PATCH /api/vault/tasks/[id]", () => {
  test("keeps assignment-only human patches queued in todo when dispatch is blocked", async () => {
    const root = await createVaultRootWithTask();

    try {
      await patchVaultTask(
        "task-001",
        { actorId: "human-user", patch: { assignee: "gpt-4-0-lumina" } },
        {
          patchTaskLifecycle: async (request) => await patchTaskLifecycle({ ...request, vaultRoot: root }),
          readCanonicalVaultReadModel: async () => ({
            workspaces: [],
            projects: [],
            boards: [],
            columns: [],
            tasks: [{ id: "task-001", status: "todo", lockedBy: null, assignee: null }],
            issues: [],
            approvals: [],
            auditNotes: [],
            docs: [],
            agents: [{ id: "gpt-4-0-lumina", aliases: [] }],
          } as never),
          resolveVaultWorkspaceRoot: () => root,
          autoDispatchAssignedTask: async () => ({
            decision: {
              status: "blocked",
              reason: "Runtime capacity exhausted (1/1 slots in use). Task queued until a runtime slot is free.",
              taskId: "task-001",
              agentId: "gpt-4-0-lumina",
              runtimeReadiness: {
                agentId: "gpt-4-0-lumina",
                runtimeKind: "opencode",
                launchMode: "subprocess",
                verificationStatus: "ready",
                installed: true,
                command: "opencode",
                path: "/bin/opencode",
                reason: null,
              },
              nextAction: "wait",
            },
            launched: false,
          }),
        },
      );

      const task = await readTaskDocument(join(root, "vault", "shared", "tasks", "task-001.md"));
      expect(task.frontmatter.assignee).toBe("gpt-4-0-lumina");
      expect(task.frontmatter.status).toBe("todo");
      expect(task.frontmatter.column).toBe("todo");
      expect(task.frontmatter.locked_by).toBeNull();
      expect(task.frontmatter.dispatch_status).toBe("blocked");
      expect(task.frontmatter.dispatch_reason).toContain("Task queued until a runtime slot is free");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("starts autorun when requested", async () => {
    const result = await patchVaultTask(
      "task-001",
      { actorId: "human-user", patch: {}, autoRun: true },
      {
        patchTaskLifecycle: async () => ({ previous: {} as never, frontmatter: {} as never, body: "", filePath: "", sourcePath: "" }),
        startTaskAutorun: async () => ({ runnerId: "runner-1", command: "claude:chat" }),
      },
    );

    expect(result).toEqual({
      previous: {},
      frontmatter: {},
      body: "",
      filePath: "",
      sourcePath: "",
      autoRun: { started: true, runnerId: "runner-1", command: "claude:chat" },
    });
  });

  test("allows assigned workers to move work to review without assignment permission", async () => {
    const result = await patchVaultTask(
      "task-001",
      { actorId: "agent-backend-dev", patch: { status: "review", progress: 100, result: "Ready for human review" } },
      {
        patchTaskLifecycle: async (request) => ({
          previous: {} as never,
          frontmatter: request.patch as never,
          body: "",
          filePath: "",
          sourcePath: "",
        }),
        readCanonicalVaultReadModel: async () => ({
          workspaces: [], projects: [], boards: [], columns: [], issues: [], approvals: [], auditNotes: [], docs: [],
          tasks: [{ id: "task-001", status: "in-progress", lockedBy: "agent-backend-dev", assignee: "agent-backend-dev", tags: ["feature-implementation"] }],
          agents: [{ id: "agent-backend-dev", aliases: [], role: "implementation", roles: ["implementation"] }],
        } as never),
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
        listRunners: () => [],
      },
    );

    expect(result.frontmatter).toMatchObject({ status: "review", progress: 100 });
  });

  test("recovers a stale lock for human retrigger assignment patches", async () => {
    const root = await createVaultRootWithTask();

    try {
      const filePath = join(root, "vault", "shared", "tasks", "task-001.md")
      const current = await readTaskDocument(filePath)
      await writeFile(filePath, serializeTaskDocument({
        ...current.frontmatter,
        assignee: "gpt-4-0-lumina",
        locked_by: "gpt-4-0-lumina",
        locked_at: "2026-04-15T09:00:00Z",
        lock_expires_at: "2026-04-15T09:05:00Z",
        heartbeat_at: "2026-04-15T09:00:00Z",
      }, current.body), "utf8")

      await patchVaultTask(
        "task-001",
        { actorId: "human-user", patch: { status: "todo", assignee: "gpt-4-0-lumina" } },
        {
          patchTaskLifecycle: async (request) => await patchTaskLifecycle({ ...request, vaultRoot: root }),
          readCanonicalVaultReadModel: async () => ({
            workspaces: [],
            projects: [],
            boards: [],
            columns: [],
            tasks: [{ id: "task-001", status: "todo", lockedBy: "gpt-4-0-lumina", assignee: "gpt-4-0-lumina" }],
            issues: [],
            approvals: [],
            auditNotes: [],
            docs: [],
            agents: [{ id: "gpt-4-0-lumina", aliases: [] }],
          } as never),
          resolveVaultWorkspaceRoot: () => root,
          autoDispatchAssignedTask: async () => ({
            decision: {
              status: "blocked",
              reason: "Runtime capacity exhausted (1/5 slots in use). Task queued until a runtime slot is free.",
              taskId: "task-001",
              agentId: "gpt-4-0-lumina",
              runtimeReadiness: {
                agentId: "gpt-4-0-lumina",
                runtimeKind: "opencode",
                launchMode: "subprocess",
                verificationStatus: "ready",
                installed: true,
                command: "opencode",
                path: "/bin/opencode",
                reason: null,
              },
              nextAction: "wait",
            },
            launched: false,
          }),
        },
      )

      const task = await readTaskDocument(filePath)
      expect(task.frontmatter.status).toBe("todo")
      expect(task.frontmatter.locked_by).toBeNull()
      expect(task.frontmatter.dispatch_status).toBe("blocked")
      expect(task.frontmatter.dispatch_reason).toContain("Task queued until a runtime slot is free")
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("auto-dispatches a newly assigned runnable task into a background session", async () => {
    const result = await patchVaultTask(
      "task-001",
      { actorId: "human-user", patch: { assignee: "gpt-4-0-lumina" } },
      {
        patchTaskLifecycle: async () => ({ previous: {} as never, frontmatter: {} as never, body: "", filePath: "", sourcePath: "" }),
        readCanonicalVaultReadModel: async () => ({
          workspaces: [], projects: [], boards: [], columns: [], issues: [], approvals: [], auditNotes: [], docs: [],
          tasks: [{ id: "task-001", status: "todo", lockedBy: null, assignee: "gpt-4-0-lumina" }],
          agents: [{ id: "gpt-4-0-lumina" }],
        } as never),
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
        autoDispatchAssignedTask: async () => ({
          decision: { status: 'ready', reason: null, taskId: 'task-001', agentId: 'gpt-4-0-lumina', runtimeReadiness: { agentId: 'gpt-4-0-lumina', runtimeKind: 'opencode', launchMode: 'subprocess', verificationStatus: 'ready', installed: true, command: 'opencode', path: '/bin/opencode', reason: null }, nextAction: 'launch' },
          launched: true,
          launch: { agentId: 'gpt-4-0-lumina', taskId: 'task-001', sessionId: 'runner-1', runnerId: 'runner-1', runtimeKind: 'opencode', launchSurface: 'background', launchMode: 'fresh', command: 'opencode', args: ['run'] },
        }),
      },
    );

    expect(result).toMatchObject({
      previous: {},
      frontmatter: {},
      body: "",
      filePath: "",
      sourcePath: "",
      autoDispatch: {
        decision: { status: 'ready', agentId: 'gpt-4-0-lumina' },
        launched: true,
        launch: { sessionId: 'runner-1', launchSurface: 'background' },
      },
    });
  });

  test("auto-assigns from tags on patch when assignee is left unassigned", async () => {
    const result = await patchVaultTask(
      "task-001",
      { actorId: "human-user", patch: { status: "todo" } },
      {
        patchTaskLifecycle: async () => ({ previous: {} as never, frontmatter: {} as never, body: "", filePath: "", sourcePath: "" }),
        readCanonicalVaultReadModel: async () => ({
          workspaces: [], projects: [], boards: [], columns: [], issues: [], approvals: [], auditNotes: [], docs: [],
          tasks: [{ id: "task-001", status: "todo", lockedBy: null, assignee: "unassigned", projectId: "project-demo", tags: ["bug-fix", "backend"] }],
          agents: [{ id: "agent-backend-dev", aliases: [], role: "implementation", roles: ["implementation"], status: "available", taskTypesAccepted: ["bug-fix"], capabilities: ["backend"], monthlyBudgetUsd: null, projectId: null }],
        } as never),
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
        autoDispatchAssignedTask: async () => ({
          decision: { status: 'ready', reason: null, taskId: 'task-001', agentId: 'agent-backend-dev', runtimeReadiness: { agentId: 'agent-backend-dev', runtimeKind: 'opencode', launchMode: 'subprocess', verificationStatus: 'ready', installed: true, command: 'opencode', path: '/bin/opencode', reason: null }, nextAction: 'launch' },
          launched: true,
          launch: { agentId: 'agent-backend-dev', taskId: 'task-001', sessionId: 'runner-1', runnerId: 'runner-1', runtimeKind: 'opencode', launchSurface: 'background', launchMode: 'fresh', command: 'opencode', args: ['run'] },
        }),
      },
    )

    expect(result).toMatchObject({
      autoDispatch: {
        launched: true,
        decision: { agentId: 'agent-backend-dev' },
      },
    })
  })

  test("does not auto-dispatch on patch when no agent matches routing tags", async () => {
    const result = await patchVaultTask(
      "task-001",
      { actorId: "human-user", patch: { status: "todo" } },
      {
        patchTaskLifecycle: async (request) => ({ previous: {} as never, frontmatter: request.patch as never, body: "", filePath: "", sourcePath: "" }),
        readCanonicalVaultReadModel: async () => ({
          workspaces: [], projects: [], boards: [], columns: [], issues: [], approvals: [], auditNotes: [], docs: [],
          tasks: [{ id: "task-001", status: "todo", lockedBy: null, assignee: "unassigned", projectId: "project-demo", tags: ["legal"] }],
          agents: [{ id: "agent-backend-dev", aliases: [], role: "implementation", roles: ["implementation"], status: "available", taskTypesAccepted: ["bug-fix"], capabilities: ["backend"], monthlyBudgetUsd: null, projectId: null }],
        } as never),
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
        autoDispatchAssignedTask: async () => {
          throw new Error('should not dispatch when no auto assignment happened')
        },
      },
    )

    expect(result.frontmatter).toMatchObject({ status: 'todo' })
    expect((result.frontmatter as unknown as Record<string, unknown>).assignee).toBeUndefined()
  })

  test("rejects assigning normal implementation tasks to coordinator agents", async () => {
    await expect(patchVaultTask(
      "task-001",
      { actorId: "human-user", patch: { assignee: "agent-coordinator" } },
      {
        patchTaskLifecycle: async () => ({ previous: {} as never, frontmatter: {} as never, body: "", filePath: "", sourcePath: "" }),
        readCanonicalVaultReadModel: async () => ({
          workspaces: [], projects: [], boards: [], columns: [], issues: [], approvals: [], auditNotes: [], docs: [],
          tasks: [{ id: "task-001", status: "todo", lockedBy: null, assignee: null, tags: ["feature-implementation"] }],
          agents: [{ id: "agent-coordinator", aliases: [], role: "coordinator", roles: ["coordinator"] }],
        } as never),
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
      },
    )).rejects.toMatchObject({ statusCode: 409 });
  });

  test("rejects assigning normal implementation tasks to legacy coordinator ids", async () => {
    await expect(patchVaultTask(
      "task-001",
      { actorId: "human-user", patch: { assignee: "agent-project-coordinator" } },
      {
        patchTaskLifecycle: async () => ({ previous: {} as never, frontmatter: {} as never, body: "", filePath: "", sourcePath: "" }),
        readCanonicalVaultReadModel: async () => ({
          workspaces: [], projects: [], boards: [], columns: [], issues: [], approvals: [], auditNotes: [], docs: [], agents: [],
          tasks: [{ id: "task-001", status: "todo", lockedBy: null, assignee: null, tags: ["feature-implementation"] }],
        } as never),
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
      },
    )).rejects.toMatchObject({ statusCode: 409 });
  });

  test("rejects system finalization without a human actor", async () => {
    await expect(patchVaultTask(
      "task-001",
      { actorId: "@relayhq-web", patch: { status: "done" } },
      {
        patchTaskLifecycle: async () => ({ previous: {} as never, frontmatter: {} as never, body: "", filePath: "", sourcePath: "" }),
        readCanonicalVaultReadModel: async () => ({
          workspaces: [], projects: [], boards: [], columns: [], issues: [], approvals: [], auditNotes: [], docs: [], agents: [],
          tasks: [{ id: "task-001", status: "review", lockedBy: null, assignee: "gpt-4-0-lumina", tags: [] }],
        } as never),
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
      },
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  test("allows workers to move their own work to review without assignment authority", async () => {
    const result = await patchVaultTask(
      "task-001",
      { actorId: "worker-1", patch: { status: "review", progress: 100, result: "Ready for human review." } },
      {
        patchTaskLifecycle: async () => ({ previous: {} as never, frontmatter: { status: "review" } as never, body: "", filePath: "", sourcePath: "" }),
        readCanonicalVaultReadModel: async () => ({
          workspaces: [], projects: [], boards: [], columns: [], issues: [], approvals: [], auditNotes: [], docs: [],
          tasks: [{ id: "task-001", status: "in-progress", lockedBy: "worker-1", assignee: "worker-1", tags: ["feature-implementation"] }],
          agents: [{ id: "worker-1", aliases: [], role: "worker", roles: ["worker"] }],
        } as never),
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
      },
    );

    expect(result.frontmatter).toEqual({ status: "review" });
  });

  test("allows workers to move their assigned task to review without reassignment permission", async () => {
    const result = await patchVaultTask(
      "task-001",
      { actorId: "gpt-4-0-lumina", patch: { status: "review" } },
      {
        patchTaskLifecycle: async () => ({ previous: {} as never, frontmatter: {} as never, body: "", filePath: "", sourcePath: "" }),
        readCanonicalVaultReadModel: async () => ({
          workspaces: [], projects: [], boards: [], columns: [], issues: [], approvals: [], auditNotes: [], docs: [],
          tasks: [{ id: "task-001", status: "in-progress", lockedBy: "gpt-4-0-lumina", assignee: "gpt-4-0-lumina", tags: ["feature-implementation"] }],
          agents: [{ id: "gpt-4-0-lumina", aliases: [], role: "worker", roles: ["worker"] }],
        } as never),
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
      },
    )

    expect(result).toMatchObject({ frontmatter: {}, body: "" })
  });

  test("writes an audit note with session usage when moving a task to review", async () => {
    const auditCalls: Array<Record<string, unknown>> = [];

    const result = await patchVaultTask(
      "task-001",
      { actorId: "agent-backend-dev", patch: { status: "review", progress: 100, result: "Ready for human review" } },
      {
        patchTaskLifecycle: async () => ({
          previous: {} as never,
          frontmatter: { tokens_used: 12, model: "claude-test", cost_usd: 0.01 } as never,
          body: "",
          filePath: "",
          sourcePath: "",
        }),
        readCanonicalVaultReadModel: async () => ({
          workspaces: [], projects: [], boards: [], columns: [], issues: [], approvals: [], auditNotes: [], docs: [],
          tasks: [{ id: "task-001", status: "in-progress", lockedBy: "agent-backend-dev", assignee: "agent-backend-dev", tags: ["feature-implementation"] }],
          agents: [{ id: "agent-backend-dev", aliases: [], role: "implementation", roles: ["implementation"] }],
        } as never),
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
        listRunners: () => [{ taskId: "task-001", sessionId: "session-1", startTime: "2026-04-15T10:00:00Z" }] as never,
        readAgentSessionUsage: async () => ({ promptTokens: 10, completionTokens: 5, totalTokens: 15, model: "claude-sonnet-4-6", costUsd: 0.05, usageSource: "session-events" }),
        writeAuditNote: async (request) => {
          auditCalls.push(request as unknown as Record<string, unknown>);
          return {} as never;
        },
      },
    );

    expect(result.frontmatter).toMatchObject({ tokens_used: 12, model: "claude-test", cost_usd: 0.01 });
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]).toMatchObject({
      taskId: "task-001",
      source: "agent-backend-dev",
      message: "task moved to review",
      promptTokens: 10,
      completionTokens: 5,
      tokensUsed: 15,
      model: "claude-sonnet-4-6",
      costUsd: 0.05,
      usageSource: "session-events",
    });
  });

  test("deletes a task document", async () => {
    const root = await createVaultRootWithTask();

    try {
      await expect(deleteVaultTask("task-001", { actorId: "human-user", vaultRoot: root })).resolves.toEqual({ success: true, taskId: "task-001" });
      await expect(readFile(join(root, "vault", "shared", "tasks", "task-001.md"), "utf8")).rejects.toBeTruthy();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
