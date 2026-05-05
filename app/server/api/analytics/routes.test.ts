import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import agentsRoute from "./agents.get";
import costRoute from "./cost.get";
import providersRoute from "./providers.get";
import summaryRoute from "./summary.get";
import velocityRoute from "./velocity.get";
import { clearProviderUsageCache } from "../../services/analytics/provider-usage";
import { clearAnalyticsCache } from "../../services/analytics/summary";

const roots: string[] = [];

afterEach(async () => {
  delete process.env.RELAYHQ_VAULT_ROOT;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_ADMIN_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  clearAnalyticsCache();
  clearProviderUsageCache();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRoot() {
  const root = await mkdtemp(join(tmpdir(), "relayhq-analytics-api-"));
  roots.push(root);
  await mkdir(join(root, "vault", "shared", "workspaces"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "projects"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "boards"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "columns"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "tasks"), { recursive: true });
  await mkdir(join(root, "vault", "shared", "agents"), { recursive: true });
  return root;
}

async function seedBase(root: string) {
  await writeFile(join(root, "vault", "shared", "workspaces", "ws-demo.md"), `---
  await writeFile(join(root, "vault", "shared", "projects", "project-demo.md"), `---
  await writeFile(join(root, "vault", "shared", "boards", "board-demo.md"), `---
  await writeFile(join(root, "vault", "shared", "columns", "todo.md"), `---
  await writeFile(join(root, "vault", "shared", "columns", "done.md"), `---
}

async function writeTask(root: string, filename: string, frontmatter: string) {
  await writeFile(join(root, "vault", "shared", "tasks", filename), `${frontmatter}\n---\n## Objective\n\nAnalytics test fixture.\n`, "utf8");
}

async function seedAnalyticsData(root: string) {
  await seedBase(root);
  await writeFile(join(root, "vault", "shared", "agents", "mary.md"), `---
  await writeTask(root, "task-done.md", `---
  await writeTask(root, "task-review.md", `---
  await writeTask(root, "task-waiting.md", `---
  await writeTask(root, "task-blocked.md", `---
}

describe("analytics routes", () => {
  test("GET /api/analytics cost, velocity, agents, and summary return stable aggregates", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    await seedAnalyticsData(root);

    const cost = await costRoute();
    const velocity = await velocityRoute();
    const agents = await agentsRoute();
    const summary = await summaryRoute();

    expect(cost).toEqual({
      totals: { costUsd: 2, tokensUsed: 150, taskCount: 2 },
      byDay: [
        { day: "2026-04-28", costUsd: 1.25, tokensUsed: 100, taskCount: 1 },
        { day: "2026-04-29", costUsd: 0.75, tokensUsed: 50, taskCount: 1 },
      ],
      byProject: [
        { projectId: "project-demo", projectName: "Demo Project", costUsd: 2, tokensUsed: 150, taskCount: 2 },
      ],
    });
    expect(velocity).toEqual({
      totals: { completedCount: 2, p50DaysToComplete: 1.5, p95DaysToComplete: 2 },
      completedPerWeek: [
        { weekStart: "2026-04-28", completedCount: 2 },
      ],
    });
    expect(agents).toEqual({
      totals: { agentCount: 1, activeTaskCount: 1, stuckTaskCount: 1 },
      scorecards: [{
        agentId: "mary",
        agentName: "Mary",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        taskCount: 4,
        completedTaskCount: 2,
        activeTaskCount: 0,
        waitingApprovalCount: 1,
        stuckCount: 1,
        approvalRate: null,
        avgCompletionDays: 1.75,
        lastCompletedAt: "2026-04-29T00:00:00Z",
        costUsd: 2,
        tokensUsed: 150,
        monthlyBudgetUsd: 10,
        monthlyCostUsd: 2,
        remainingBudgetUsd: 8,
      }],
    });
    expect(summary).toEqual({ cost, velocity, agents });
  });

  test("GET /api/analytics/summary handles empty state", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    await seedBase(root);

    const summary = await summaryRoute();

    expect(summary).toEqual({
      cost: {
        totals: { costUsd: 0, tokensUsed: 0, taskCount: 0 },
        byDay: [],
        byProject: [],
      },
      velocity: {
        totals: { completedCount: 0, p50DaysToComplete: null, p95DaysToComplete: null },
        completedPerWeek: [],
      },
      agents: {
        totals: { agentCount: 0, activeTaskCount: 0, stuckTaskCount: 0 },
        scorecards: [],
      },
    });
  });

  test("GET /api/analytics/providers returns deterministic provider usage without live dependencies", async () => {
    const root = await createRoot();
    process.env.RELAYHQ_VAULT_ROOT = root;
    await seedAnalyticsData(root);

    const response = await providersRoute();

    expect(response.providers).toEqual([
      expect.objectContaining({
        provider: "anthropic",
        label: "Anthropic",
        availability: "unavailable",
        source: "none",
        limitUsd: null,
        usedUsd: null,
        remainingUsd: null,
        detail: "No provider API key configured.",
      }),
    ]);
    expect(response.agents).toEqual([
      expect.objectContaining({
        agentId: "mary",
        agentName: "Mary",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        recentCostUsd: 2,
        recentTokensUsed: 150,
        recentTaskCount: 2,
        byDay: [
          { day: "2026-04-28", costUsd: 1.25, tokensUsed: 100, taskCount: 1 },
          { day: "2026-04-29", costUsd: 0.75, tokensUsed: 50, taskCount: 1 },
        ],
        providerQuota: expect.objectContaining({ provider: "anthropic", availability: "unavailable" }),
      }),
    ]);
    expect(response.generatedAt).toEqual(expect.any(String));
  });
});
