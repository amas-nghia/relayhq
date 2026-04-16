import { describe, expect, test } from "bun:test";

import type { ReadModelTask, VaultReadModel } from "../../models/read-model";
import type { TaskFrontmatter } from "../../../shared/vault/schema";
import {
  createApprovalIntent,
  createClaimIntent,
  createHeartbeatIntent,
  createUpdateIntent,
  type RelayHQProtocolClient,
} from "./commands";
import {
  createRelayHQHttpProtocolClient,
  executeRelayHQInvocation,
  parseRelayHQInvocation,
  renderRelayHQHelp,
  resolveRelayHQBaseUrl,
} from "../../../../cli/relayhq";

function createTask(overrides: Partial<TaskFrontmatter> = {}): TaskFrontmatter {
  return {
    id: "task-001",
    type: "task",
    version: 1,
    workspace_id: "ws-acme",
    project_id: "project-alpha",
    board_id: "board-alpha",
    column: "todo",
    status: "todo",
    priority: "high",
    title: "Ready task",
    assignee: "agent-alpha",
    created_by: "@alice",
    created_at: "2026-04-14T10:00:00Z",
    updated_at: "2026-04-14T10:00:00Z",
    heartbeat_at: null,
    execution_started_at: null,
    execution_notes: null,
    progress: 0,
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
    ...overrides,
  };
}

function createReadModelTask(overrides: Partial<ReadModelTask> = {}): ReadModelTask {
  const task = createTask();

  return {
    id: task.id,
    type: "task",
    workspaceId: task.workspace_id,
    projectId: task.project_id,
    boardId: task.board_id,
    columnId: task.column,
    status: task.status,
    priority: task.priority,
    title: task.title,
    assignee: task.assignee,
    createdBy: task.created_by,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    heartbeatAt: task.heartbeat_at,
    executionStartedAt: task.execution_started_at,
    executionNotes: task.execution_notes,
    progress: task.progress,
    approvalNeeded: task.approval_needed,
    approvalRequestedBy: task.approval_requested_by,
    approvalReason: task.approval_reason,
    approvedBy: task.approved_by,
    approvedAt: task.approved_at,
    approvalOutcome: task.approval_outcome,
    blockedReason: task.blocked_reason,
    blockedSince: task.blocked_since,
    result: task.result,
    completedAt: task.completed_at,
    parentTaskId: task.parent_task_id,
    dependsOn: task.depends_on,
    tags: task.tags,
    links: task.links.map((link) => ({ projectId: link.project, threadId: link.thread })),
    lockedBy: task.locked_by,
    lockedAt: task.locked_at,
    lockExpiresAt: task.lock_expires_at,
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
    body: "# Task\n",
    sourcePath: `vault/shared/tasks/${task.id}.md`,
    ...overrides,
  };
}

describe("agent protocol writeback intents", () => {
  test("claim intent marks the task in progress and seeds heartbeat time", () => {
    const intent = createClaimIntent("task-001", "agent-alpha", "2026-04-14T12:00:00Z");

    expect(intent).toEqual({
      command: "claim",
      target: "control-plane",
      taskId: "task-001",
      assignee: "agent-alpha",
      startedAt: "2026-04-14T12:00:00Z",
      heartbeatAt: "2026-04-14T12:00:00Z",
      status: "in-progress",
    });
  });

  test("approval intent preserves the approval gate boundary", () => {
    const intent = createApprovalIntent("task-001", "agent-alpha", "Need human sign-off", "2026-04-14T12:05:00Z");

    expect(intent.status).toBe("waiting-approval");
    expect(intent.approvalNeeded).toBe(true);
  });

  test("update and heartbeat intents keep the payload local to the control plane", () => {
    const update = createUpdateIntent("task-001", "agent-alpha", "done", "2026-04-14T12:10:00Z", 100, "completed");
    const heartbeat = createHeartbeatIntent("task-001", "agent-alpha", "2026-04-14T12:11:00Z");

    expect(update.target).toBe("control-plane");
    expect(update.completedAt).toBe("2026-04-14T12:10:00Z");
    expect(heartbeat.target).toBe("control-plane");
  });
});

describe("relayhq cli surface", () => {
  test("parses the command and flags", () => {
    const invocation = parseRelayHQInvocation(["update", "task-001", "--assignee=agent-alpha", "--status=done"]);

    expect(invocation.command).toBe("update");
    expect(invocation.positional).toEqual(["task-001"]);
    expect(invocation.flags.get("assignee")).toBe("agent-alpha");
  });

  test("lists ready tasks through the protocol client without running work", async () => {
    const client: RelayHQProtocolClient = {
      listTasks: async () => [
        createTask({ id: "task-001", status: "done" }),
        createTask({ id: "task-002", depends_on: ["task-001"] }),
        createTask({ id: "task-003", assignee: "agent-beta" }),
      ],
      claimTask: async () => ({}),
      updateTaskStatus: async () => ({}),
      sendHeartbeat: async () => ({}),
      requestApproval: async () => ({}),
    };

    const result = await executeRelayHQInvocation(client, ["tasks", "--assignee=agent-alpha"], new Date("2026-04-14T12:00:00Z"));

    expect(result.command).toBe("tasks");
    expect(result.payload).toEqual([createTask({ id: "task-002", depends_on: ["task-001"] })]);
  });

  test("claims, updates, heartbeats, and requests approval through the transport", async () => {
    const calls: Array<{ readonly kind: string; readonly payload: unknown }> = [];
    const client: RelayHQProtocolClient = {
      listTasks: async () => [],
      claimTask: async (payload) => {
        calls.push({ kind: "claim", payload });
        return payload;
      },
      updateTaskStatus: async (payload) => {
        calls.push({ kind: "update", payload });
        return payload;
      },
      sendHeartbeat: async (payload) => {
        calls.push({ kind: "heartbeat", payload });
        return payload;
      },
      requestApproval: async (payload) => {
        calls.push({ kind: "request-approval", payload });
        return payload;
      },
    };

    await executeRelayHQInvocation(client, ["claim", "task-001", "--assignee=agent-alpha"], new Date("2026-04-14T12:00:00Z"));
    await executeRelayHQInvocation(client, ["update", "task-001", "--assignee=agent-alpha", "--status=done"], new Date("2026-04-14T12:01:00Z"));
    await executeRelayHQInvocation(client, ["heartbeat", "task-001", "--assignee=agent-alpha"], new Date("2026-04-14T12:02:00Z"));
    await executeRelayHQInvocation(
      client,
      ["request-approval", "task-001", "--assignee=agent-alpha", "--reason=Need sign-off"],
      new Date("2026-04-14T12:03:00Z"),
    );

    expect(calls.map((call) => call.kind)).toEqual(["claim", "update", "heartbeat", "request-approval"]);
  });

  test("rejects invalid writeback arguments before emitting intents", async () => {
    const client: RelayHQProtocolClient = {
      listTasks: async () => [],
      claimTask: async () => ({}),
      updateTaskStatus: async () => ({}),
      sendHeartbeat: async () => ({}),
      requestApproval: async () => ({}),
    };

    await expect(executeRelayHQInvocation(client, ["update", "task-001", "--assignee=agent-alpha", "--status=not-a-status"])).rejects.toThrow(
      "Invalid status 'not-a-status'.",
    );
  });

  test("renders help from the command surface", () => {
    const help = renderRelayHQHelp();

    expect(help[0]).toBe("RelayHQ CLI");
    expect(help.join("\n")).toContain("relayhq request-approval <task-id>");
  });

  test("resolves the CLI base URL from flags before env defaults", () => {
    expect(resolveRelayHQBaseUrl(["tasks", "--base-url=http://127.0.0.1:4010"], { RELAYHQ_BASE_URL: "http://127.0.0.1:3001" })).toBe(
      "http://127.0.0.1:4010",
    );
    expect(resolveRelayHQBaseUrl(["tasks"], { RELAYHQ_BASE_URL: "http://127.0.0.1:3001" })).toBe("http://127.0.0.1:3001");
  });

  test("uses the app read-model API to list tasks by assignee", async () => {
    const calls: Array<{ readonly url: string; readonly method: string }> = [];
    const readModel: VaultReadModel = {
      workspaces: [],
      projects: [],
      boards: [],
      columns: [],
      approvals: [],
      auditNotes: [],
      agents: [],
      tasks: [
        createReadModelTask({ id: "task-002", assignee: "agent-alpha", title: "Ready task" }),
        createReadModelTask({ id: "task-003", assignee: "agent-beta", title: "Other task" }),
      ],
    };
    const client = createRelayHQHttpProtocolClient({
      baseUrl: "http://127.0.0.1:3000",
      fetchFn: async (url, init) => {
        calls.push({ url: String(url), method: init?.method ?? "GET" });
        return new Response(JSON.stringify(readModel), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    const tasks = await client.listTasks("agent-alpha");

    expect(calls).toEqual([{ url: "http://127.0.0.1:3000/api/vault/read-model", method: "GET" }]);
    expect(tasks).toEqual([createTask({ id: "task-002", title: "Ready task" })]);
  });

  test("writes claim, update, heartbeat, and approval requests through the app task APIs", async () => {
    const calls: Array<{ readonly url: string; readonly method: string; readonly body: unknown }> = [];
    const client = createRelayHQHttpProtocolClient({
      baseUrl: "http://127.0.0.1:3000/",
      fetchFn: async (url, init) => {
        calls.push({
          url: String(url),
          method: init?.method ?? "GET",
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        });

        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });

    await client.claimTask(createClaimIntent("task-001", "agent-alpha", "2026-04-14T12:00:00Z"));
    await client.updateTaskStatus(createUpdateIntent("task-001", "agent-alpha", "done", "2026-04-14T12:01:00Z", 100, "PR #42"));
    await client.sendHeartbeat(createHeartbeatIntent("task-001", "agent-alpha", "2026-04-14T12:02:00Z"));
    await client.requestApproval(createApprovalIntent("task-001", "agent-alpha", "Need sign-off", "2026-04-14T12:03:00Z"));

    expect(calls).toEqual([
      {
        url: "http://127.0.0.1:3000/api/vault/tasks/task-001/claim",
        method: "POST",
        body: { actorId: "agent-alpha", assignee: "agent-alpha" },
      },
      {
        url: "http://127.0.0.1:3000/api/vault/tasks/task-001",
        method: "PATCH",
        body: {
          actorId: "agent-alpha",
          patch: {
            status: "done",
            column: "done",
            progress: 100,
            result: "PR #42",
            completed_at: "2026-04-14T12:01:00Z",
          },
        },
      },
      {
        url: "http://127.0.0.1:3000/api/vault/tasks/task-001/heartbeat",
        method: "POST",
        body: { actorId: "agent-alpha" },
      },
      {
        url: "http://127.0.0.1:3000/api/vault/tasks/task-001/request-approval",
        method: "POST",
        body: { actorId: "agent-alpha", reason: "Need sign-off" },
      },
    ]);
  });
});
