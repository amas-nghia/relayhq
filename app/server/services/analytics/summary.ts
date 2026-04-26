import { filterVaultReadModelByWorkspaceId, type ReadModelProject, type ReadModelTask, type VaultReadModel } from "../../models/read-model";
import { readCanonicalVaultReadModel } from "../vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, resolveVaultWorkspaceRoot } from "../vault/runtime";

const ANALYTICS_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedReadModelEntry {
  readonly expiresAt: number;
  readonly pending?: Promise<VaultReadModel>;
  readonly value?: VaultReadModel;
}

const analyticsReadModelCache = new Map<string, CachedReadModelEntry>();

export function clearAnalyticsCache(): void {
  analyticsReadModelCache.clear();
}

export interface AnalyticsCostDay {
  readonly day: string;
  readonly costUsd: number;
  readonly tokensUsed: number;
  readonly taskCount: number;
}

export interface AnalyticsCostProject {
  readonly projectId: string;
  readonly projectName: string;
  readonly costUsd: number;
  readonly tokensUsed: number;
  readonly taskCount: number;
}

export interface AnalyticsCostResponse {
  readonly totals: {
    readonly costUsd: number;
    readonly tokensUsed: number;
    readonly taskCount: number;
  };
  readonly byDay: ReadonlyArray<AnalyticsCostDay>;
  readonly byProject: ReadonlyArray<AnalyticsCostProject>;
}

export interface AnalyticsVelocityWeek {
  readonly weekStart: string;
  readonly completedCount: number;
}

export interface AnalyticsVelocityResponse {
  readonly totals: {
    readonly completedCount: number;
    readonly p50DaysToComplete: number | null;
    readonly p95DaysToComplete: number | null;
  };
  readonly completedPerWeek: ReadonlyArray<AnalyticsVelocityWeek>;
}

export interface AnalyticsAgentScorecardRow {
  readonly agentId: string;
  readonly agentName: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly taskCount: number;
  readonly completedTaskCount: number;
  readonly activeTaskCount: number;
  readonly waitingApprovalCount: number;
  readonly stuckCount: number;
  readonly approvalRate: number | null;
  readonly avgCompletionDays: number | null;
  readonly lastCompletedAt: string | null;
  readonly costUsd: number;
  readonly tokensUsed: number;
  readonly monthlyBudgetUsd: number | null;
  readonly monthlyCostUsd: number;
  readonly remainingBudgetUsd: number | null;
}

export interface AnalyticsAgentsResponse {
  readonly totals: {
    readonly agentCount: number;
    readonly activeTaskCount: number;
    readonly stuckTaskCount: number;
  };
  readonly scorecards: ReadonlyArray<AnalyticsAgentScorecardRow>;
}

export interface AnalyticsDashboardResponse {
  readonly cost: AnalyticsCostResponse;
  readonly velocity: AnalyticsVelocityResponse;
  readonly agents: AnalyticsAgentsResponse;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundCurrency(value: number): number {
  return roundTo(value, 2);
}

function toDay(value: string): string {
  return value.slice(0, 10);
}

function toIsoWeekStart(value: string): string {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  const weekdayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekdayOffset);
  return date.toISOString().slice(0, 10);
}

function readCompletionTimestamp(task: ReadModelTask): string | null {
  if (task.completedAt) {
    return task.completedAt;
  }

  if (task.status === "done" || task.status === "review") {
    return task.updatedAt;
  }

  return null;
}

function readCompletionDays(task: ReadModelTask): number | null {
  const completedAt = readCompletionTimestamp(task);
  if (completedAt === null) {
    return null;
  }

  const startedAt = task.executionStartedAt ?? task.createdAt;
  const durationMs = Date.parse(completedAt) - Date.parse(startedAt);
  if (!Number.isFinite(durationMs)) {
    return null;
  }

  return roundTo(Math.max(0, durationMs) / 86_400_000, 2);
}

function percentile(values: ReadonlyArray<number>, target: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * target) - 1));
  return roundTo(sorted[index] ?? sorted[sorted.length - 1]!, 2);
}

function getProjectName(projectsById: ReadonlyMap<string, ReadModelProject>, projectId: string): string {
  return projectsById.get(projectId)?.name ?? projectId;
}

function isAgentTaskStuck(task: ReadModelTask): boolean {
  return readCompletionTimestamp(task) === null && (task.status === "blocked" || task.blockedSince !== null || task.isStale);
}

function isAgentTaskActive(task: ReadModelTask): boolean {
  return readCompletionTimestamp(task) === null && (task.status === "in-progress" || task.status === "review");
}

function isTaskAwaitingApproval(task: ReadModelTask): boolean {
  return readCompletionTimestamp(task) === null && task.status === "waiting-approval";
}

function createWorkspaceReadModel(readModel: VaultReadModel): VaultReadModel {
  const workspaceId = normalizeConfiguredWorkspaceId(readConfiguredWorkspaceId(), readModel.workspaces);
  return workspaceId === null ? readModel : filterVaultReadModelByWorkspaceId(readModel, workspaceId);
}

async function readCachedRawAnalyticsReadModel(): Promise<VaultReadModel> {
  const cacheKey = resolveVaultWorkspaceRoot();
  const now = Date.now();
  const cached = analyticsReadModelCache.get(cacheKey);

  if (cached?.value !== undefined && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached?.pending !== undefined) {
    return cached.pending;
  }

  const pending = readCanonicalVaultReadModel(cacheKey)
    .then((readModel) => {
      analyticsReadModelCache.set(cacheKey, {
        expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS,
        value: readModel,
      });
      return readModel;
    })
    .catch((error) => {
      analyticsReadModelCache.delete(cacheKey);
      throw error;
    });

  analyticsReadModelCache.set(cacheKey, {
    expiresAt: now + ANALYTICS_CACHE_TTL_MS,
    pending,
  });

  return pending;
}

export async function readAnalyticsReadModel(): Promise<VaultReadModel> {
  const readModel = await readCachedRawAnalyticsReadModel();
  return createWorkspaceReadModel(readModel);
}

export function aggregateCostAnalytics(readModel: VaultReadModel): AnalyticsCostResponse {
  const projectsById = new Map(readModel.projects.map((project) => [project.id, project] as const));
  const taskRows = readModel.tasks
    .map((task) => ({
      task,
      completedAt: readCompletionTimestamp(task),
      costUsd: task.costUsd ?? 0,
      tokensUsed: task.tokensUsed ?? 0,
    }))
    .filter((entry) => entry.completedAt !== null && (entry.costUsd > 0 || entry.tokensUsed > 0));

  const byDay = new Map<string, { day: string; costUsd: number; tokensUsed: number; taskCount: number }>();
  const byProject = new Map<string, { projectId: string; projectName: string; costUsd: number; tokensUsed: number; taskCount: number }>();

  for (const entry of taskRows) {
    const dayKey = toDay(entry.completedAt!);
    const dayRow = byDay.get(dayKey) ?? { day: dayKey, costUsd: 0, tokensUsed: 0, taskCount: 0 };
    dayRow.costUsd += entry.costUsd;
    dayRow.tokensUsed += entry.tokensUsed;
    dayRow.taskCount += 1;
    byDay.set(dayKey, dayRow);

    const projectRow = byProject.get(entry.task.projectId) ?? {
      projectId: entry.task.projectId,
      projectName: getProjectName(projectsById, entry.task.projectId),
      costUsd: 0,
      tokensUsed: 0,
      taskCount: 0,
    };
    projectRow.costUsd += entry.costUsd;
    projectRow.tokensUsed += entry.tokensUsed;
    projectRow.taskCount += 1;
    byProject.set(entry.task.projectId, projectRow);
  }

  return {
    totals: {
      costUsd: roundCurrency(taskRows.reduce((sum, entry) => sum + entry.costUsd, 0)),
      tokensUsed: taskRows.reduce((sum, entry) => sum + entry.tokensUsed, 0),
      taskCount: taskRows.length,
    },
    byDay: [...byDay.values()]
      .map((entry) => ({ ...entry, costUsd: roundCurrency(entry.costUsd) }))
      .sort((left, right) => left.day.localeCompare(right.day)),
    byProject: [...byProject.values()]
      .map((entry) => ({ ...entry, costUsd: roundCurrency(entry.costUsd) }))
      .sort((left, right) => right.costUsd - left.costUsd || right.tokensUsed - left.tokensUsed),
  };
}

export function aggregateVelocityAnalytics(readModel: VaultReadModel): AnalyticsVelocityResponse {
  const completedTasks = readModel.tasks
    .map((task) => ({ task, completedAt: readCompletionTimestamp(task), completionDays: readCompletionDays(task) }))
    .filter((entry) => entry.completedAt !== null);

  const completedPerWeek = new Map<string, { weekStart: string; completedCount: number }>();
  for (const entry of completedTasks) {
    const weekStart = toIsoWeekStart(entry.completedAt!);
    const weekRow = completedPerWeek.get(weekStart) ?? { weekStart, completedCount: 0 };
    weekRow.completedCount += 1;
    completedPerWeek.set(weekStart, weekRow);
  }

  const completionDays = completedTasks
    .map((entry) => entry.completionDays)
    .filter((value): value is number => value !== null);

  return {
    totals: {
      completedCount: completedTasks.length,
      p50DaysToComplete: percentile(completionDays, 0.5),
      p95DaysToComplete: percentile(completionDays, 0.95),
    },
    completedPerWeek: [...completedPerWeek.values()].sort((left, right) => left.weekStart.localeCompare(right.weekStart)),
  };
}

export function aggregateAgentAnalytics(readModel: VaultReadModel): AnalyticsAgentsResponse {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const knownAgents = new Map(readModel.agents.map((agent) => [agent.id, agent] as const));
  const agentIds = new Set<string>();

  for (const agent of readModel.agents) {
    agentIds.add(agent.id);
  }

  for (const task of readModel.tasks) {
    if (task.assignee.trim().length > 0) {
      agentIds.add(task.assignee);
    }
  }

  const scorecards = [...agentIds]
    .map((agentId) => {
      const agent = knownAgents.get(agentId) ?? null;
      const assignedTasks = readModel.tasks.filter((task) => task.assignee === agentId);
      const completedTasks = assignedTasks.filter((task) => readCompletionTimestamp(task) !== null);
      const activeTaskCount = assignedTasks.filter(isAgentTaskActive).length;
      const waitingApprovalCount = assignedTasks.filter(isTaskAwaitingApproval).length;
      const stuckCount = assignedTasks.filter(isAgentTaskStuck).length;
      const approvalDecisions = completedTasks.filter((task) => task.approvalOutcome === "approved" || task.approvalOutcome === "rejected");
      const approvedCount = approvalDecisions.filter((task) => task.approvalOutcome === "approved").length;
      const completionDays = completedTasks.map(readCompletionDays).filter((value): value is number => value !== null);
      const monthlyCostUsd = completedTasks.reduce((sum, task) => {
        const completedAt = readCompletionTimestamp(task);
        if (completedAt?.startsWith(currentMonth) !== true) {
          return sum;
        }
        return sum + (task.costUsd ?? 0);
      }, 0);
      const costUsd = completedTasks.reduce((sum, task) => sum + (task.costUsd ?? 0), 0);
      const tokensUsed = completedTasks.reduce((sum, task) => sum + (task.tokensUsed ?? 0), 0);
      const lastCompletedAt = completedTasks
        .map((task) => readCompletionTimestamp(task))
        .filter((value): value is string => value !== null)
        .sort((left, right) => right.localeCompare(left))[0] ?? null;
      const monthlyBudgetUsd = agent?.monthlyBudgetUsd ?? null;

      return {
        agentId,
        agentName: agent?.name ?? agentId,
        provider: agent?.provider ?? null,
        model: agent?.model ?? null,
        taskCount: assignedTasks.length,
        completedTaskCount: completedTasks.length,
        activeTaskCount,
        waitingApprovalCount,
        stuckCount,
        approvalRate: approvalDecisions.length > 0 ? roundTo((approvedCount / approvalDecisions.length) * 100, 1) : null,
        avgCompletionDays: completionDays.length > 0 ? roundTo(completionDays.reduce((sum, value) => sum + value, 0) / completionDays.length, 2) : null,
        lastCompletedAt,
        costUsd: roundCurrency(costUsd),
        tokensUsed,
        monthlyBudgetUsd,
        monthlyCostUsd: roundCurrency(monthlyCostUsd),
        remainingBudgetUsd: monthlyBudgetUsd === null ? null : roundCurrency(monthlyBudgetUsd - monthlyCostUsd),
      } satisfies AnalyticsAgentScorecardRow;
    })
    .sort((left, right) => {
      if (right.completedTaskCount !== left.completedTaskCount) {
        return right.completedTaskCount - left.completedTaskCount;
      }
      if (right.costUsd !== left.costUsd) {
        return right.costUsd - left.costUsd;
      }
      return left.agentName.localeCompare(right.agentName);
    });

  return {
    totals: {
      agentCount: scorecards.length,
      activeTaskCount: scorecards.reduce((sum, row) => sum + row.activeTaskCount + row.waitingApprovalCount, 0),
      stuckTaskCount: scorecards.reduce((sum, row) => sum + row.stuckCount, 0),
    },
    scorecards,
  };
}

export async function readCostAnalytics(): Promise<AnalyticsCostResponse> {
  return aggregateCostAnalytics(await readAnalyticsReadModel());
}

export async function readVelocityAnalytics(): Promise<AnalyticsVelocityResponse> {
  return aggregateVelocityAnalytics(await readAnalyticsReadModel());
}

export async function readAgentAnalytics(): Promise<AnalyticsAgentsResponse> {
  return aggregateAgentAnalytics(await readAnalyticsReadModel());
}

export async function readAnalyticsDashboard(): Promise<AnalyticsDashboardResponse> {
  const readModel = await readAnalyticsReadModel();

  return {
    cost: aggregateCostAnalytics(readModel),
    velocity: aggregateVelocityAnalytics(readModel),
    agents: aggregateAgentAnalytics(readModel),
  };
}
