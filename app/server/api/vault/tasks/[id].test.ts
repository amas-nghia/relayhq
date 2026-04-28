import { describe, expect, test } from "bun:test";

import { patchVaultTask } from "./[id]";

describe("PATCH /api/vault/tasks/[id]", () => {
  test("keeps assignment-only human patches unlocked", async () => {
    const calls: Array<Record<string, unknown>> = []

    await patchVaultTask(
      "task-001",
      { actorId: "human-user", patch: { assignee: "gpt-4-0-lumina" } },
      {
        patchTaskLifecycle: async (request) => {
          calls.push(request as unknown as Record<string, unknown>)
          return { previous: {} as never, frontmatter: {} as never, body: "", filePath: "", sourcePath: "" }
        },
        readCanonicalVaultReadModel: async () => ({
          workspaces: [],
          projects: [],
          boards: [],
          columns: [],
          tasks: [{ id: "task-001", status: "todo", lockedBy: null }],
          issues: [],
          approvals: [],
          auditNotes: [],
          docs: [],
          agents: [{ id: "gpt-4-0-lumina" }],
        } as never),
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-test",
        autoDispatchAssignedTask: async () => ({
          decision: { status: 'blocked', reason: 'test', taskId: 'task-001', agentId: 'gpt-4-0-lumina', runtimeReadiness: { agentId: 'gpt-4-0-lumina', runtimeKind: null, launchMode: null, verificationStatus: 'unknown', installed: false, command: null, path: null, reason: 'test' }, nextAction: 'wait' },
          launched: false,
        }),
      },
    )

    expect(calls).toHaveLength(2)
    expect(calls[0]?.releaseLock).toBe(true)
    expect(calls[1]?.releaseLock).toBe(true)
  })

  test("starts autorun when requested", async () => {
    const result = await patchVaultTask(
      "task-001",
      { actorId: "human-user", patch: {}, autoRun: true },
      {
        patchTaskLifecycle: async () => ({ previous: {} as never, frontmatter: {} as never, body: "" }),
        startTaskAutorun: async () => ({ runnerId: "runner-1", command: "claude:chat" }),
      },
    );

    expect(result).toEqual({
      previous: {},
      frontmatter: {},
      body: "",
      autoRun: { started: true, runnerId: "runner-1", command: "claude:chat" },
    });
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
    )

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
    })
  })
});
