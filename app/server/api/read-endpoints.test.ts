import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import agentsAnalyticsHandler from "./analytics/agents.get";
import costAnalyticsHandler from "./analytics/cost.get";
import summaryAnalyticsHandler from "./analytics/summary.get";
import velocityAnalyticsHandler from "./analytics/velocity.get";
import healthHandler from "./health.get";
import availableClisHandler from "./runners/available-clis.get";
import readModelHandler from "./vault/read-model.get";
import { clearAnalyticsCache } from "../services/analytics/summary";

const roots: string[] = [];

afterEach(async () => {
  clearAnalyticsCache();
  delete process.env.RELAYHQ_VAULT_ROOT;
  delete process.env.RELAYHQ_WORKSPACE_ID;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "relayhq-read-endpoints-"));
  roots.push(root);
  await Promise.all([
    mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true }),
    mkdir(join(root, "vault", "shared", "projects"), { recursive: true }),
    mkdir(join(root, "vault", "shared", "tasks"), { recursive: true }),
    mkdir(join(root, "vault", "shared", "agents"), { recursive: true }),
  ]);
  return root;
}

async function writeWorkspace(root: string, id: string, name: string) {
  await writeFile(join(root, "vault", "shared", "workspaces", `${id}.md`), [
    "---",
    `id: ${JSON.stringify(id)}`,
    'type: "workspace"',
    `name: ${JSON.stringify(name)}`,
    'owner_ids: ["@owner"]',
    'member_ids: ["@owner"]',
    'created_at: "2026-04-19T10:00:00Z"',
    'updated_at: "2026-04-19T10:00:00Z"',
    "---",
    "",
  ].join("\n"), "utf8");
}

describe("read-style backend endpoints", () => {
  test("GET /api/vault/read-model returns empty collections and honors workspace filtering", async () => {
    const root = await createRoot();
    await writeWorkspace(root, "ws-alpha", "Alpha Workspace");
    await writeWorkspace(root, "ws-beta", "Beta Workspace");
    await writeFile(join(root, "vault", "shared", "projects", "project-beta.md"), [
      "---",
      'id: "project-beta"',
      'type: "project"',
      'workspace_id: "ws-beta"',
      'name: "Beta Project"',
      'created_at: "2026-04-20T00:00:00Z"',
      'updated_at: "2026-04-20T00:00:00Z"',
      "---",
      "# Beta Project",
    ].join("\n"), "utf8");

    process.env.RELAYHQ_VAULT_ROOT = root;
    await expect(readModelHandler({} as never)).resolves.toMatchObject({
      workspaces: [
        expect.objectContaining({ id: "ws-alpha", name: "Alpha Workspace" }),
        expect.objectContaining({ id: "ws-beta", name: "Beta Workspace" }),
      ],
      projects: [expect.objectContaining({ id: "project-beta", workspaceId: "ws-beta" })],
      tasks: [],
      docs: [],
      agents: [],
    });

    process.env.RELAYHQ_WORKSPACE_ID = "ws-beta";
    await expect(readModelHandler({} as never)).resolves.toMatchObject({
      workspaces: [expect.objectContaining({ id: "ws-beta", name: "Beta Workspace" })],
      projects: [expect.objectContaining({ id: "project-beta", workspaceId: "ws-beta" })],
      tasks: [],
    });
  });

  test("GET /api/analytics/* returns stable dashboard and summary shapes", async () => {
    const root = await createRoot();
    await writeWorkspace(root, "ws-demo", "Demo Workspace");
    await writeFile(join(root, "vault", "shared", "projects", "project-demo.md"), [
      "---",
      'id: "project-demo"',
      'type: "project"',
      'workspace_id: "ws-demo"',
      'name: "Demo Project"',
      'created_at: "2026-04-20T00:00:00Z"',
      'updated_at: "2026-04-20T00:00:00Z"',
      "---",
      "# Demo Project",
    ].join("\n"), "utf8");
    await writeFile(join(root, "vault", "shared", "agents", "agent-claude-code.md"), [
      "---",
      'id: "agent-claude-code"',
      'type: "agent"',
      'name: "Claude Code"',
      'role: "implementation"',
      'roles: ["implementation"]',
      'provider: "anthropic"',
      'model: "claude-sonnet-4-6"',
      'capabilities: []',
      'task_types_accepted: []',
      'approval_required_for: []',
      'cannot_do: []',
      'accessible_by: []',
      'skill_file: "skills/claude-code.md"',
      'status: "available"',
      'workspace_id: "ws-demo"',
      'monthly_budget_usd: 10',
      'created_at: "2026-04-20T00:00:00Z"',
      'updated_at: "2026-04-20T00:00:00Z"',
      "---",
      "",
    ].join("\n"), "utf8");
    await writeFile(join(root, "vault", "shared", "tasks", "task-complete.md"), [
      "---",
      'id: "task-complete"',
      'type: "task"',
      'workspace_id: "ws-demo"',
      'project_id: "project-demo"',
      'board_id: "board-demo"',
      'column: "review"',
      'status: "review"',
      'priority: "high"',
      'title: "Completed task"',
      'assignee: "agent-claude-code"',
      'created_by: "@owner"',
      'created_at: "2026-04-20T00:00:00Z"',
      'updated_at: "2026-04-21T00:00:00Z"',
      'execution_started_at: "2026-04-20T00:00:00Z"',
      'completed_at: "2026-04-21T00:00:00Z"',
      'approval_outcome: "approved"',
      'cost_usd: 1.25',
      'tokens_used: 2500',
      'depends_on: []',
      'tags: []',
      'links: []',
      "---",
      "",
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
      'priority: "medium"',
      'title: "Active task"',
      'assignee: "agent-claude-code"',
      'created_by: "@owner"',
      'created_at: "2026-04-22T00:00:00Z"',
      'updated_at: "2026-04-22T12:00:00Z"',
      'approval_outcome: "pending"',
      'depends_on: []',
      'tags: []',
      'links: []',
      "---",
      "",
    ].join("\n"), "utf8");

    process.env.RELAYHQ_VAULT_ROOT = root;
    const dashboard = await summaryAnalyticsHandler({} as never);
    expect(dashboard).toEqual({
      cost: {
        totals: { costUsd: 1.25, tokensUsed: 2500, taskCount: 1 },
        byDay: [{ day: "2026-04-21", costUsd: 1.25, tokensUsed: 2500, taskCount: 1 }],
        byProject: [{ projectId: "project-demo", projectName: "Demo Project", costUsd: 1.25, tokensUsed: 2500, taskCount: 1 }],
      },
      velocity: {
        totals: { completedCount: 1, p50DaysToComplete: 1, p95DaysToComplete: 1 },
        completedPerWeek: [{ weekStart: "2026-04-21", completedCount: 1 }],
      },
      agents: {
        totals: { agentCount: 1, activeTaskCount: 1, stuckTaskCount: 0 },
        scorecards: [
          {
            agentId: "agent-claude-code",
            agentName: "Claude Code",
            provider: "anthropic",
            model: "claude-sonnet-4-6",
            taskCount: 2,
            completedTaskCount: 1,
            activeTaskCount: 1,
            waitingApprovalCount: 0,
            stuckCount: 0,
            approvalRate: 100,
            avgCompletionDays: 1,
            lastCompletedAt: "2026-04-21T00:00:00Z",
            costUsd: 1.25,
            tokensUsed: 2500,
            monthlyBudgetUsd: 10,
            monthlyCostUsd: 0,
            remainingBudgetUsd: 10,
          },
        ],
      },
    });
    await expect(costAnalyticsHandler({} as never)).resolves.toEqual(dashboard.cost);
    await expect(velocityAnalyticsHandler({} as never)).resolves.toEqual(dashboard.velocity);
    await expect(agentsAnalyticsHandler({} as never)).resolves.toEqual(dashboard.agents);
  });

  test("GET /api/health returns status, version, uptime, and resolved vault root", () => {
    process.env.RELAYHQ_VAULT_ROOT = "/tmp/relayhq-health-root";

    const response = healthHandler({} as never);
    expect(response.status).toBe("ok");
    expect(response.version).toBeDefined();
    expect(response.uptime).toBeNumber();
    expect(response.vaultRoot).toBe("/tmp/relayhq-health-root");
  });

  test("GET /api/runners/available-clis returns known CLI entries with stable shape", () => {
    const response = availableClisHandler({} as never);
    expect(response).toHaveLength(7);
    expect(response.map((entry) => entry.id)).toEqual(["claude", "opencode", "interpreter", "aider", "cline", "ollama", "npx"]);
    for (const entry of response) {
      expect(entry).toEqual(expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        command: expect.any(String),
        installed: expect.any(Boolean),
        description: expect.any(String),
      }));
      if (entry.installed) {
        expect(entry.path).toEqual(expect.any(String));
      }
    }
  });
});
