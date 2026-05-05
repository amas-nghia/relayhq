import { describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../../../models/read-model";
import { getProjectCoordinatorThread, openProjectCoordinatorThread } from "../../../../services/vault/project-coordinator-thread";

function createReadModel(coordinatorAgentId: string | null = "agent-coordinator"): VaultReadModel {
  return {
    workspaces: [],
    boards: [],
    columns: [],
    tasks: [],
    issues: [],
    approvals: [],
    auditNotes: [],
    docs: [],
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
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      body: "",
      sourcePath: "vault/shared/agents/agent-coordinator.md",
    }],
    coordinatorThreads: [],
    projects: [{
      id: "project-demo",
      type: "project",
      workspaceId: "ws-demo",
      name: "Demo Project",
      coordinatorAgentId,
      boardIds: [],
      columnIds: [],
      taskIds: [],
      approvalIds: [],
      coordinatorThreadIds: [],
      codebases: [],
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      description: null,
      budget: null,
      deadline: null,
      status: null,
      scene: null,
      links: [],
      attachments: [],
      body: "",
      sourcePath: "vault/shared/projects/project-demo.md",
    }],
  };
}

const thread = {
  sourcePath: "vault/shared/coordinator-threads/coordinator-thread-project-demo.md",
  filePath: "/tmp/relayhq-vault/vault/shared/coordinator-threads/coordinator-thread-project-demo.md",
  created: true,
  body: "# Demo Project Coordinator Thread",
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

describe("project coordinator thread API", () => {
  test("retrieves the active durable coordinator thread for a project", async () => {
    const response = await getProjectCoordinatorThread("project-demo", {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => ({
        ...createReadModel(),
        coordinatorThreads: [{
          id: "coordinator-thread-project-demo",
          type: "coordinator-thread",
          workspaceId: "ws-demo",
          projectId: "project-demo",
          coordinatorAgentId: "agent-coordinator",
          activeSessionId: "session-1",
          status: "active",
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
          body: "# Demo Project Coordinator Thread",
          sourcePath: "vault/shared/coordinator-threads/coordinator-thread-project-demo.md",
        }],
      }),
    });

    expect(response?.created).toBe(false);
    expect(response?.thread.id).toBe("coordinator-thread-project-demo");
    expect(response?.thread.activeSessionId).toBe("session-1");
  });

  test("opens the durable coordinator thread for a project", async () => {
    const response = await openProjectCoordinatorThread("project-demo", {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(),
      openThread: async (request) => {
        expect(request.projectId).toBe("project-demo");
        expect(request.coordinatorAgentId).toBe("agent-coordinator");
        return thread;
      },
    });

    expect(response.created).toBe(true);
    expect(response.thread.id).toBe("coordinator-thread-project-demo");
    expect(response.thread.projectId).toBe("project-demo");
    expect(response.thread.coordinatorAgentId).toBe("agent-coordinator");
    expect(response.thread.activeSessionId).toBeNull();
    expect(response.thread.status).toBe("active");
  });

  test("idempotently returns the existing active thread when opened repeatedly", async () => {
    const responses = await Promise.all([
      openProjectCoordinatorThread("project-demo", {
        resolveRoot: () => "/tmp/relayhq-vault",
        readModelReader: async () => createReadModel(),
        openThread: async () => ({ ...thread, created: true }),
      }),
      openProjectCoordinatorThread("project-demo", {
        resolveRoot: () => "/tmp/relayhq-vault",
        readModelReader: async () => createReadModel(),
        openThread: async () => ({ ...thread, created: false }),
      }),
    ]);

    expect(responses.map((response) => response.thread.id)).toEqual([
      "coordinator-thread-project-demo",
      "coordinator-thread-project-demo",
    ]);
    expect(responses[1].created).toBe(false);
  });

  test("rejects projects without a coordinator assignment", async () => {
    await expect(openProjectCoordinatorThread("project-demo", {
      resolveRoot: () => "/tmp/relayhq-vault",
      readModelReader: async () => createReadModel(null),
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});
