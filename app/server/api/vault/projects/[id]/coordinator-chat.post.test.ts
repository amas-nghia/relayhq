import { describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../../../models/read-model";
import type { RelayHQRuntime } from "../../../../services/agents/protocol-pack";
import { openProjectCoordinatorChat } from "./coordinator-chat.post";

function createReadModel(): VaultReadModel {
  return {
    workspaces: [],
    boards: [],
    columns: [],
    issues: [],
    docs: [],
    approvals: [],
    auditNotes: [],
    coordinatorThreads: [],
    projects: [{
      id: "project-demo",
      type: "project",
      workspaceId: "ws-demo",
      name: "Demo Project",
      coordinatorAgentId: "agent-coordinator",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      boardIds: [],
      taskIds: [],
      description: null,
      budget: null,
      deadline: null,
      status: null,
      scene: null,
      links: [],
      attachments: [],
      codebases: [],
      body: "",
      sourcePath: "vault/shared/projects/project-demo.md",
      columnIds: [],
      approvalIds: [],
      coordinatorThreadIds: [],
    }],
    tasks: [],
    agents: [{
      id: "agent-coordinator",
      type: "agent",
      workspaceId: "ws-demo",
      name: "Coordinator",
      accountId: null,
      role: "coordinator",
      roles: ["coordinator"],
      provider: "anthropic",
      apiKeyRef: null,
      portraitAsset: null,
      spriteAsset: null,
      model: "claude-sonnet-4-6",
      fallbackModels: [],
      monthlyBudgetUsd: null,
      aliases: [],
      runtimeKind: "claude-code",
      runCommand: null,
      commandTemplate: "claude -p \"{prompt}\"",
      runMode: "manual",
      webhookUrl: null,
      workingDirectoryStrategy: "project-root",
      supportsResume: true,
      supportsStreaming: true,
      bootstrapStrategy: "instruction-file",
      verificationStatus: "ready",
      capabilities: [],
      taskTypesAccepted: [],
      approvalRequiredFor: [],
      cannotDo: [],
      accessibleBy: [],
      skillFile: "skills/coordinator.md",
      skillFiles: [],
      status: "available",
      projectId: null,
      createdAt: "2026-04-23T00:00:00Z",
      updatedAt: "2026-04-23T00:00:00Z",
      body: "",
      sourcePath: "vault/shared/agents/agent-coordinator.md",
    }],
  };
}

describe("POST /api/vault/projects/[id]/coordinator-chat", () => {
  const thread = {
    sourcePath: "vault/shared/coordinator-threads/coordinator-thread-project-demo.md",
    filePath: "/tmp/relayhq-vault/vault/shared/coordinator-threads/coordinator-thread-project-demo.md",
    created: true,
    body: "",
    frontmatter: {
      id: "coordinator-thread-project-demo",
      type: "coordinator-thread" as const,
      workspace_id: "ws-demo",
      project_id: "project-demo",
      coordinator_agent_id: "agent-coordinator",
      active_session_id: null,
      status: "active" as const,
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z",
    },
  };

  test("returns an existing active coordinator background session", async () => {
    const response = await openProjectCoordinatorChat("project-demo", {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      openThread: async () => thread,
      setThreadActiveSession: async () => thread,
      activeSessionsReader: () => [{
        id: "runner-1",
        sessionId: "runner-1",
        agentName: "agent-coordinator",
        taskId: "coordinator-thread-project-demo",
        provider: "anthropic",
        runtimeKind: "claude-code",
        launchSurface: "background",
        launchMode: "resume",
        resumedFromSessionId: null,
        status: "running",
        command: "claude",
        cwd: "/tmp/relayhq-vault",
        startTime: "2026-05-01T00:00:00Z",
        lastEventAt: "2026-05-01T00:00:10Z",
      }],
      launchSession: async () => {
        throw new Error("should not launch");
      },
    });

    expect(response.projectId).toBe("project-demo");
    expect(response.coordinatorAgentId).toBe("agent-coordinator");
    expect(response.sessionId).toBe("runner-1");
    expect(response.taskId).toBe("coordinator-thread-project-demo");
    expect(response.coordinatorThreadId).toBe("coordinator-thread-project-demo");
  });

  test("reuses the thread's active session before launching a new coordinator chat", async () => {
    const response = await openProjectCoordinatorChat("project-demo", {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      openThread: async () => ({ ...thread, frontmatter: { ...thread.frontmatter, active_session_id: "runner-thread" } }),
      setThreadActiveSession: async () => thread,
      activeSessionsReader: () => [{
        id: "runner-thread",
        sessionId: "runner-thread",
        agentName: "agent-coordinator",
        taskId: "coordinator-thread-project-demo",
        provider: "anthropic",
        runtimeKind: "claude-code",
        launchSurface: "background",
        launchMode: "resume",
        resumedFromSessionId: null,
        status: "running",
        command: "claude",
        cwd: "/tmp/relayhq-vault",
        startTime: "2026-05-01T00:00:00Z",
        lastEventAt: "2026-05-01T00:00:10Z",
      }],
      launchSession: async () => {
        throw new Error("should not launch")
      },
    })

    expect(response.sessionId).toBe("runner-thread")
    expect(response.coordinatorThreadId).toBe("coordinator-thread-project-demo")
  })

  test("starts a fresh coordinator chat when no active one exists", async () => {
    const response = await openProjectCoordinatorChat("project-demo", {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      openThread: async () => ({ ...thread, frontmatter: { ...thread.frontmatter, active_session_id: "runner-old" } }),
      setThreadActiveSession: async () => thread,
      clearThreadActiveSession: async () => thread,
      activeSessionsReader: () => [],
      recordedSessionsReader: async () => [{
        sessionId: "runner-old",
        agentId: "agent-coordinator",
        taskId: "coordinator-thread-project-demo",
        launchMode: "fresh",
        runtimeKind: "claude-code",
        command: "claude",
        startTime: "2026-05-01T00:00:00Z",
        lastEventAt: "2026-05-01T00:00:05Z",
        status: "completed",
      }],
      launchSession: async (request) => ({
        agentId: request.agentId,
        taskId: request.taskId,
        coordinatorThreadId: request.coordinatorThreadId,
        sessionId: "runner-new",
        runnerId: "runner-new",
        runtimeKind: "claude-code",
        launchSurface: "background",
        launchMode: request.mode ?? "fresh",
        command: "claude",
        args: ["-p"],
      }),
    });

    expect(response.sessionId).toBe("runner-new");
    expect(response.launchMode).toBe("fresh");
    expect(response.coordinatorThreadId).toBe("coordinator-thread-project-demo");
  });

  test("can force a fresh coordinator session even when a reusable one exists", async () => {
    let stoppedSessionId: string | null = null;
    const response = await openProjectCoordinatorChat("project-demo", {
      message: "start over",
      mode: "fresh",
    }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      openThread: async () => thread,
      setThreadActiveSession: async () => thread,
      activeSessionsReader: () => [{
        id: "runner-old",
        sessionId: "runner-old",
        agentName: "agent-coordinator",
        taskId: "coordinator-thread-project-demo",
        provider: "anthropic",
        runtimeKind: "claude-code",
        launchSurface: "background",
        launchMode: "resume",
        resumedFromSessionId: null,
        status: "running",
        command: "claude",
        cwd: "/tmp/relayhq-vault",
        startTime: "2026-05-01T00:00:00Z",
        lastEventAt: "2026-05-01T00:00:10Z",
      }],
      launchSession: async (request) => ({
        agentId: request.agentId,
        taskId: request.taskId,
        coordinatorThreadId: request.coordinatorThreadId,
        sessionId: "runner-fresh",
        runnerId: "runner-fresh",
        runtimeKind: "claude-code",
        launchSurface: "background",
        launchMode: request.mode ?? "fresh",
        command: "claude",
        args: ["-p"],
      }),
      bindRuntime: async () => ({ success: true, agentId: "agent-coordinator" } as never),
    });

    expect(response.sessionId).toBe("runner-fresh");
    expect(response.launchMode).toBe("fresh");
    expect(stoppedSessionId).toBeNull();
    expect(response.coordinatorThreadId).toBe("coordinator-thread-project-demo");
  });

  test("reset clears the thread's active session before launching fresh", async () => {
    let clearedThread = false;
    const response = await openProjectCoordinatorChat("project-demo", {
      mode: "reset",
    }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      openThread: async () => ({ ...thread, frontmatter: { ...thread.frontmatter, active_session_id: "runner-old" } }),
      setThreadActiveSession: async () => thread,
      clearThreadActiveSession: async () => {
        clearedThread = true;
        return thread;
      },
      activeSessionsReader: () => [],
      recordedSessionsReader: async () => [{
        sessionId: "runner-old",
        agentId: "agent-coordinator",
        taskId: "coordinator-thread-project-demo",
        launchMode: "fresh",
        runtimeKind: "claude-code",
        command: "claude",
        startTime: "2026-05-01T00:00:00Z",
        lastEventAt: "2026-05-01T00:00:05Z",
        status: "completed",
      }],
      launchSession: async (request) => ({
        agentId: request.agentId,
        taskId: request.taskId,
        coordinatorThreadId: request.coordinatorThreadId,
        sessionId: "runner-reset",
        runnerId: "runner-reset",
        runtimeKind: "claude-code",
        launchSurface: "background",
        launchMode: request.mode ?? "fresh",
        command: "claude",
        args: ["-p"],
      }),
      bindRuntime: async () => ({ success: true, agentId: "agent-coordinator" } as never),
    });

    expect(clearedThread).toBe(true);
    expect(response.sessionId).toBe("runner-reset");
    expect(response.launchMode).toBe("fresh");
  });

  test("sends a message to the live coordinator session without relaunching", async () => {
    const response = await openProjectCoordinatorChat("project-demo", {
      message: "continue",
    }, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      openThread: async () => ({ ...thread, frontmatter: { ...thread.frontmatter, active_session_id: "runner-live" } }),
      setThreadActiveSession: async () => thread,
      activeSessionsReader: () => [{
        id: "runner-live",
        sessionId: "runner-live",
        agentName: "agent-coordinator",
        taskId: "coordinator-thread-project-demo",
        provider: "anthropic",
        runtimeKind: "claude-code",
        launchSurface: "background",
        launchMode: "resume",
        resumedFromSessionId: null,
        status: "running",
        command: "claude",
        cwd: "/tmp/relayhq-vault",
        startTime: "2026-05-01T00:00:00Z",
        lastEventAt: "2026-05-01T00:00:10Z",
      }],
      sendInput: () => ({ success: true, sessionId: "runner-live" }),
      launchSession: async () => {
        throw new Error("should not relaunch live session")
      },
      bindRuntime: async () => ({ success: true, agentId: "agent-coordinator" } as never),
    });

    expect(response.sessionId).toBe("runner-live");
    expect(response.launchMode).toBe("resume");
  });

  test("coalesces concurrent coordinator thread chat launches", async () => {
    let launchCount = 0;
    const responses = await Promise.all([
      openProjectCoordinatorChat("project-demo", {
        resolveRoot: () => "/tmp/relayhq-vault",
        readModelReader: async () => createReadModel(),
        openThread: async () => thread,
        setThreadActiveSession: async () => thread,
        activeSessionsReader: () => [],
        recordedSessionsReader: async () => [],
        launchSession: async (request) => {
          launchCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            agentId: request.agentId,
            taskId: request.taskId,
            coordinatorThreadId: request.coordinatorThreadId,
            sessionId: "runner-new",
            runnerId: "runner-new",
            runtimeKind: "claude-code",
            launchSurface: "background",
            launchMode: request.mode ?? "fresh",
            command: "claude",
            args: ["-p"],
          };
        },
      }),
      openProjectCoordinatorChat("project-demo", {
        resolveRoot: () => "/tmp/relayhq-vault",
        readModelReader: async () => createReadModel(),
        openThread: async () => thread,
        setThreadActiveSession: async () => thread,
        activeSessionsReader: () => [],
        recordedSessionsReader: async () => [],
        launchSession: async () => {
          throw new Error("should share pending launch");
        },
      }),
    ]);

    expect(launchCount).toBe(1);
    expect(responses.map((response) => response.sessionId)).toEqual(["runner-new", "runner-new"]);
  });

  test("binds an unconfigured coordinator runtime before launching chat", async () => {
    let boundRuntime: string | null = null;
    const baseReadModel = createReadModel();
    const readModel = {
      ...baseReadModel,
      agents: baseReadModel.agents.map((agent) => ({
        ...agent,
        runtimeKind: null,
        commandTemplate: null,
        runCommand: null,
      })),
    };

    const response = await openProjectCoordinatorChat("project-demo", {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => readModel,
      openThread: async () => thread,
      setThreadActiveSession: async () => thread,
      activeSessionsReader: () => [],
      recordedSessionsReader: async () => [],
      bindRuntime: async (_agentId, body) => {
        const runtime = (body.runtime ?? "opencode") as RelayHQRuntime;
        boundRuntime = runtime;
        return {
          success: true,
          agentId: "agent-coordinator",
          runtime,
          install: { runtime, filename: "README.md", content: "" },
          settingsSnippet: { snippet: "", configFilePath: "settings.json", instruction: "" },
        };
      },
      launchSession: async (request) => ({
        agentId: request.agentId,
        taskId: request.taskId,
        coordinatorThreadId: request.coordinatorThreadId,
        sessionId: "runner-new",
        runnerId: "runner-new",
        runtimeKind: "opencode",
        launchSurface: "background",
        launchMode: request.mode ?? "fresh",
        command: "opencode",
        args: ["run"],
      }),
    });

    expect(boundRuntime).toBe("claude-code");
    expect(response.sessionId).toBe("runner-new");
  });
});
