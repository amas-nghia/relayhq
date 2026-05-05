import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { listAgentSessions } from "./sessions.get";

describe("GET /api/agent/[id]/sessions", () => {
  test("includes recorded sessions after the live runner is gone", async () => {
    const sessions = await listAgentSessions("agent-coordinator", {}, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => ({
        workspaces: [],
        projects: [],
        boards: [],
        columns: [],
        tasks: [],
        issues: [],
        docs: [],
        approvals: [],
        auditNotes: [],
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
          commandTemplate: null,
          runMode: null,
          webhookUrl: null,
          workingDirectoryStrategy: null,
          supportsResume: true,
          supportsStreaming: true,
          bootstrapStrategy: null,
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
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          body: "",
          sourcePath: "vault/shared/agents/agent-coordinator.md",
        }],
      } as never),
      activeSessionsReader: () => [],
      recordedSessionsReader: async () => ([{
        sessionId: "session-4",
        agentId: "agent-coordinator",
        taskId: "task-coordinator",
        launchMode: "resume",
        runtimeKind: "claude-code",
        command: "claude -p",
        startTime: "2026-01-01T00:00:00.000Z",
        lastEventAt: "2026-01-01T00:00:02.000Z",
        status: "completed",
      }]),
    })

    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.sessionId).toBe("session-4")
    expect(sessions[0]?.launchMode).toBe("resume")
    expect(sessions[0]?.status).toBe("completed")
    expect(sessions[0]?.runtimeKind).toBe("claude-code")
  })

  test("downgrades only orphan recorded running sessions to stopped", async () => {
    const sessions = await listAgentSessions("agent-impl", {}, {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => ({
        workspaces: [],
        projects: [],
        boards: [],
        columns: [],
        tasks: [],
        issues: [],
        docs: [],
        approvals: [],
        auditNotes: [],
        agents: [{
          id: "agent-impl",
          type: "agent",
          workspaceId: "ws-demo",
          name: "Implementation",
          accountId: null,
          role: "implementation",
          roles: ["implementation"],
          provider: "openai",
          apiKeyRef: null,
          portraitAsset: null,
          spriteAsset: null,
          model: "gpt-5.4",
          fallbackModels: [],
          monthlyBudgetUsd: null,
          aliases: [],
          runtimeKind: "opencode",
          runCommand: null,
          commandTemplate: null,
          runMode: null,
          webhookUrl: null,
          workingDirectoryStrategy: null,
          supportsResume: true,
          supportsStreaming: true,
          bootstrapStrategy: null,
          verificationStatus: "ready",
          capabilities: [],
          taskTypesAccepted: [],
          approvalRequiredFor: [],
          cannotDo: [],
          accessibleBy: [],
          skillFile: "skills/implementation.md",
          skillFiles: [],
          status: "available",
          projectId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          body: "",
          sourcePath: "vault/shared/agents/agent-impl.md",
        }],
      } as never),
      activeSessionsReader: () => ([{
        id: "live-1",
        sessionId: "live-1",
        agentName: "agent-impl",
        taskId: "task-live",
        provider: "openai",
        runtimeKind: "opencode",
        launchSurface: "background",
        launchMode: "fresh",
        resumedFromSessionId: null,
        status: "running",
        command: "opencode",
        cwd: null,
        startTime: "2026-01-01T00:00:00.000Z",
        lastEventAt: "2026-01-01T00:00:10.000Z",
      }] as never),
      recordedSessionsReader: async () => ([
        {
          sessionId: "orphan-1",
          agentId: "agent-impl",
          taskId: "task-orphan",
          launchMode: "fresh",
          runtimeKind: "opencode",
          command: "opencode run",
          startTime: "2026-01-01T00:00:00.000Z",
          lastEventAt: "2026-01-01T00:00:09.000Z",
          status: "running",
        },
        {
          sessionId: "live-1",
          agentId: "agent-impl",
          taskId: "task-live",
          launchMode: "fresh",
          runtimeKind: "opencode",
          command: "opencode run",
          startTime: "2026-01-01T00:00:00.000Z",
          lastEventAt: "2026-01-01T00:00:10.000Z",
          status: "running",
        },
      ]),
    })

    expect(sessions).toHaveLength(2)
    expect(sessions.find((session) => session.sessionId === "live-1")?.status).toBe("running")
    expect(sessions.find((session) => session.sessionId === "orphan-1")?.status).toBe("stopped")
  })

  test("filters sessions by project id using the registry records", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-agent-sessions-project-"))

    try {
      await mkdir(join(root, "vault", "shared", "threads"), { recursive: true })
      await writeFile(join(root, "vault", "shared", "threads", "agent-task-sessions.json"), JSON.stringify({
        sessions: [
          {
            agentId: "agent-impl",
            taskId: "task-alpha",
            sessionId: "session-alpha",
            projectId: "project-alpha",
            status: "active",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            agentId: "agent-impl",
            taskId: "task-beta",
            sessionId: "session-beta",
            projectId: "project-beta",
            status: "active",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }, null, 2), "utf8")

      const sessions = await listAgentSessions("agent-impl", { projectId: "project-alpha" }, {
        resolveRoot: () => root,
        readModelReader: async () => ({
          workspaces: [],
          projects: [],
          boards: [],
          columns: [],
          tasks: [],
          issues: [],
          docs: [],
          approvals: [],
          auditNotes: [],
          agents: [{
            id: "agent-impl",
            type: "agent",
            workspaceId: "ws-demo",
            name: "Implementation",
            accountId: null,
            role: "implementation",
            roles: ["implementation"],
            provider: "openai",
            apiKeyRef: null,
            portraitAsset: null,
            spriteAsset: null,
            model: "gpt-5.4",
            fallbackModels: [],
            monthlyBudgetUsd: null,
            aliases: [],
            runtimeKind: "opencode",
            runCommand: null,
            commandTemplate: null,
            runMode: null,
            webhookUrl: null,
            workingDirectoryStrategy: null,
            supportsResume: true,
            supportsStreaming: true,
            bootstrapStrategy: null,
            verificationStatus: "ready",
            capabilities: [],
            taskTypesAccepted: [],
            approvalRequiredFor: [],
            cannotDo: [],
            accessibleBy: [],
            skillFile: "skills/implementation.md",
            skillFiles: [],
            status: "available",
            projectId: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            body: "",
            sourcePath: "vault/shared/agents/agent-impl.md",
          }],
        } as never),
        activeSessionsReader: () => [],
        recordedSessionsReader: async () => ([
          {
            sessionId: "session-alpha",
            agentId: "agent-impl",
            taskId: "task-alpha",
            launchMode: "fresh",
            runtimeKind: "opencode",
            command: "opencode run",
            startTime: "2026-01-01T00:00:00.000Z",
            lastEventAt: "2026-01-01T00:00:10.000Z",
            status: "completed",
          },
          {
            sessionId: "session-beta",
            agentId: "agent-impl",
            taskId: "task-beta",
            launchMode: "resume",
            runtimeKind: "opencode",
            command: "opencode resume",
            startTime: "2026-01-01T00:00:01.000Z",
            lastEventAt: "2026-01-01T00:00:11.000Z",
            status: "completed",
          },
        ]),
      })

      expect(sessions).toHaveLength(1)
      expect(sessions[0]?.sessionId).toBe("session-alpha")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
