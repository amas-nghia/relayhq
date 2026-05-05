import { listRecordedAgentSessions, readAgentSessionUsage } from "../agents/session-events";
import { resolveVaultWorkspaceRoot } from "../vault/runtime";
import { readAnalyticsReadModel } from "./summary";
import type { ReadModelTask } from "../../models/read-model";

const PROVIDER_USAGE_CACHE_TTL_MS = 5 * 60 * 1000

export interface ProviderQuotaSummary {
  readonly provider: string
  readonly label: string
  readonly availability: 'available' | 'unavailable' | 'error'
  readonly source: 'live' | 'none'
  readonly limitUsd: number | null
  readonly usedUsd: number | null
  readonly remainingUsd: number | null
  readonly detail: string | null
  readonly checkedAt: string
}

export interface AgentProviderUsageDay {
  readonly day: string
  readonly costUsd: number
  readonly tokensUsed: number
  readonly taskCount: number
}

export interface AgentProviderUsageSummary {
  readonly agentId: string
  readonly agentName: string
  readonly provider: string | null
  readonly model: string | null
  readonly recentCostUsd: number
  readonly recentTokensUsed: number
  readonly recentTaskCount: number
  readonly byDay: ReadonlyArray<AgentProviderUsageDay>
  readonly providerQuota: ProviderQuotaSummary | null
}

export interface ProviderUsageResponse {
  readonly generatedAt: string
  readonly providers: ReadonlyArray<ProviderQuotaSummary>
  readonly agents: ReadonlyArray<AgentProviderUsageSummary>
}

interface ProviderUsageAnalyticsDependencies {
  readonly readModelReader?: typeof readAnalyticsReadModel
  readonly listRecordedAgentSessions?: typeof listRecordedAgentSessions
  readonly readAgentSessionUsage?: typeof readAgentSessionUsage
  readonly vaultRoot?: string
  readonly env?: NodeJS.ProcessEnv
  readonly now?: Date
}

interface CachedProviderUsageEntry {
  readonly expiresAt: number
  readonly value?: ProviderQuotaSummary
  readonly pending?: Promise<ProviderQuotaSummary>
}

const providerUsageCache = new Map<string, CachedProviderUsageEntry>()

export function clearProviderUsageCache(): void {
  providerUsageCache.clear()
}

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  openrouter: 'OpenRouter',
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

function toDay(value: string): string {
  return value.slice(0, 10)
}

function readCompletionTimestamp(task: ReadModelTask): string | null {
  if (task.completedAt) return task.completedAt
  if (task.status === 'done' || task.status === 'review') return task.updatedAt
  return null
}

function aggregateTaskUsage(agentId: string, tasks: ReadonlyArray<ReadModelTask>, cutoffDay: string): {
  recentCostUsd: number
  recentTokensUsed: number
  recentTaskCount: number
  byDay: ReadonlyArray<AgentProviderUsageDay>
} {
  const completedTasks = tasks.filter((task) => (
    task.assignee === agentId
    && task.costUsd != null
    && task.tokensUsed != null
    && (task.completedAt ?? task.updatedAt).slice(0, 10) >= cutoffDay
  ))

  const byDayMap = new Map<string, { day: string; costUsd: number; tokensUsed: number; taskCount: number }>()
  for (const task of completedTasks) {
    const day = toDay(task.completedAt ?? task.updatedAt)
    const current = byDayMap.get(day) ?? { day, costUsd: 0, tokensUsed: 0, taskCount: 0 }
    current.costUsd += task.costUsd ?? 0
    current.tokensUsed += task.tokensUsed ?? 0
    current.taskCount += 1
    byDayMap.set(day, current)
  }

  return {
    recentCostUsd: roundCurrency(completedTasks.reduce((sum, task) => sum + (task.costUsd ?? 0), 0)),
    recentTokensUsed: completedTasks.reduce((sum, task) => sum + (task.tokensUsed ?? 0), 0),
    recentTaskCount: completedTasks.length,
    byDay: [...byDayMap.values()]
      .map((entry) => ({ ...entry, costUsd: roundCurrency(entry.costUsd) }))
      .sort((left, right) => left.day.localeCompare(right.day)),
  }
}

async function aggregateSessionUsage(
  tasks: ReadonlyArray<ReadModelTask>,
  cutoffDay: string,
  vaultRoot: string,
  dependencies: ProviderUsageAnalyticsDependencies,
): Promise<Map<string, {
  recentCostUsd: number
  recentTokensUsed: number
  recentTaskCount: number
  byDay: ReadonlyArray<AgentProviderUsageDay>
}>> {
  const runListRecordedAgentSessions = dependencies.listRecordedAgentSessions ?? listRecordedAgentSessions
  const runReadAgentSessionUsage = dependencies.readAgentSessionUsage ?? readAgentSessionUsage
  const sessions = await runListRecordedAgentSessions(vaultRoot)
  const completedTaskDays = new Map(
    tasks
      .map((task) => {
        const completedAt = readCompletionTimestamp(task)
        return completedAt === null ? null : [task.id, toDay(completedAt)] as const
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  )

  const aggregates = new Map<string, {
    costUsd: number
    tokensUsed: number
    completedTaskIds: Set<string>
    byDay: Map<string, { costUsd: number; tokensUsed: number; taskIds: Set<string> }>
  }>()

  await Promise.all(sessions.map(async (session) => {
    if (toDay(session.lastEventAt) < cutoffDay) return

    const usage = await runReadAgentSessionUsage(vaultRoot, session.sessionId)
    const agentId = usage.agentId ?? session.agentId
    if (!agentId) return

    const costUsd = usage.costUsd ?? 0
    const tokensUsed = usage.totalTokens ?? 0
    if (costUsd <= 0 && tokensUsed <= 0) return

    const aggregate = aggregates.get(agentId) ?? {
      costUsd: 0,
      tokensUsed: 0,
      completedTaskIds: new Set<string>(),
      byDay: new Map<string, { costUsd: number; tokensUsed: number; taskIds: Set<string> }>(),
    }
    aggregate.costUsd += costUsd
    aggregate.tokensUsed += tokensUsed

    const day = toDay(session.lastEventAt)
    const dayAggregate = aggregate.byDay.get(day) ?? { costUsd: 0, tokensUsed: 0, taskIds: new Set<string>() }
    dayAggregate.costUsd += costUsd
    dayAggregate.tokensUsed += tokensUsed

    const taskId = usage.taskId ?? session.taskId
    if (taskId) {
      const completedDay = completedTaskDays.get(taskId)
      if (completedDay && completedDay >= cutoffDay) {
        aggregate.completedTaskIds.add(taskId)
      }
      dayAggregate.taskIds.add(taskId)
    }

    aggregate.byDay.set(day, dayAggregate)
    aggregates.set(agentId, aggregate)
  }))

  return new Map([...aggregates.entries()].map(([agentId, aggregate]) => [agentId, {
    recentCostUsd: roundCurrency(aggregate.costUsd),
    recentTokensUsed: aggregate.tokensUsed,
    recentTaskCount: aggregate.completedTaskIds.size,
    byDay: [...aggregate.byDay.entries()]
      .map(([day, entry]) => ({
        day,
        costUsd: roundCurrency(entry.costUsd),
        tokensUsed: entry.tokensUsed,
        taskCount: entry.taskIds.size,
      }))
      .sort((left, right) => left.day.localeCompare(right.day)),
  }]))
}

function getProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider
}

function getProviderApiKey(provider: string, env: NodeJS.ProcessEnv = process.env): string | null {
  switch (provider) {
    case 'anthropic':
      return env.ANTHROPIC_API_KEY?.trim() || null
    case 'openai':
      return env.OPENAI_ADMIN_KEY?.trim() || env.OPENAI_API_KEY?.trim() || null
    case 'google':
      return env.GOOGLE_API_KEY?.trim() || env.GEMINI_API_KEY?.trim() || null
    case 'openrouter':
      return env.OPENROUTER_API_KEY?.trim() || null
    default:
      return null
  }
}

function unavailableProviderQuota(provider: string, detail: string): ProviderQuotaSummary {
  return {
    provider,
    label: getProviderLabel(provider),
    availability: 'unavailable',
    source: 'none',
    limitUsd: null,
    usedUsd: null,
    remainingUsd: null,
    detail,
    checkedAt: new Date().toISOString(),
  }
}

async function fetchOpenRouterQuota(apiKey: string): Promise<ProviderQuotaSummary> {
  const checkedAt = new Date().toISOString()
  const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })

  if (response.status === 401) {
    return {
      ...unavailableProviderQuota('openrouter', 'Invalid API key.'),
      availability: 'error',
      checkedAt,
    }
  }
  if (!response.ok) {
    return {
      ...unavailableProviderQuota('openrouter', `HTTP ${response.status}`),
      availability: 'error',
      checkedAt,
    }
  }

  const body = await response.json().catch(() => ({})) as {
    data?: {
      usage?: number
      limit?: number
      limit_remaining?: number
      is_free_tier?: boolean
      rate_limit?: { requests?: number; interval?: string }
      label?: string
    }
  }
  const usage = typeof body.data?.usage === 'number' ? body.data.usage : null
  const limit = typeof body.data?.limit === 'number' ? body.data.limit : null
  const remaining = typeof body.data?.limit_remaining === 'number'
    ? body.data.limit_remaining
    : (limit !== null && usage !== null ? limit - usage : null)

  return {
    provider: 'openrouter',
    label: getProviderLabel('openrouter'),
    availability: 'available',
    source: 'live',
    limitUsd: limit === null ? null : roundCurrency(limit),
    usedUsd: usage === null ? null : roundCurrency(usage),
    remainingUsd: remaining === null ? null : roundCurrency(remaining),
    detail: body.data?.is_free_tier ? 'Free tier account.' : null,
    checkedAt,
  }
}

async function fetchOpenAIQuota(apiKey: string): Promise<ProviderQuotaSummary> {
  const checkedAt = new Date().toISOString()
  const now = Math.floor(Date.now() / 1000)
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60)
  const response = await fetch(`https://api.openai.com/v1/organization/costs?start_time=${thirtyDaysAgo}&bucket_width=1d&limit=31`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })

  if (response.status === 401 || response.status === 403) {
    return unavailableProviderQuota('openai', 'OpenAI admin/billing access is not available for this key.')
  }
  if (!response.ok) {
    return {
      ...unavailableProviderQuota('openai', `HTTP ${response.status}`),
      availability: 'error',
      checkedAt,
    }
  }

  const body = await response.json().catch(() => ({})) as {
    data?: Array<{ results?: Array<{ amount?: { value?: number } }> }>
  }
  const usedUsd = roundCurrency((body.data ?? []).reduce((sum, bucket) => {
    const bucketValue = (bucket.results ?? []).reduce((inner, result) => inner + (result.amount?.value ?? 0), 0)
    return sum + bucketValue
  }, 0))

  return {
    provider: 'openai',
    label: getProviderLabel('openai'),
    availability: 'available',
    source: 'live',
    limitUsd: null,
    usedUsd,
    remainingUsd: null,
    detail: '30-day organization cost available; remaining quota is not exposed by this integration.',
    checkedAt,
  }
}

async function readProviderQuota(provider: string, env: NodeJS.ProcessEnv = process.env): Promise<ProviderQuotaSummary> {
  const apiKey = getProviderApiKey(provider, env)
  if (!apiKey) {
    return unavailableProviderQuota(provider, 'No provider API key configured.')
  }

  switch (provider) {
    case 'openrouter':
      return await fetchOpenRouterQuota(apiKey)
    case 'openai':
      return await fetchOpenAIQuota(apiKey)
    case 'anthropic':
      return unavailableProviderQuota(provider, 'Live billing/quota endpoint is not configured for Anthropic in this workspace.')
    case 'google':
      return unavailableProviderQuota(provider, 'Google/Gemini quota endpoint is not integrated yet.')
    default:
      return unavailableProviderQuota(provider, 'Unknown provider.')
  }
}

async function readCachedProviderQuota(provider: string, env: NodeJS.ProcessEnv = process.env): Promise<ProviderQuotaSummary> {
  const now = Date.now()
  const cached = providerUsageCache.get(provider)
  if (cached?.value && cached.expiresAt > now) return cached.value
  if (cached?.pending) return cached.pending

  const pending = readProviderQuota(provider, env)
    .then((value) => {
      providerUsageCache.set(provider, { expiresAt: Date.now() + PROVIDER_USAGE_CACHE_TTL_MS, value })
      return value
    })
    .catch((error) => {
      providerUsageCache.delete(provider)
      throw error
    })

  providerUsageCache.set(provider, { expiresAt: now + PROVIDER_USAGE_CACHE_TTL_MS, pending })
  return pending
}

export async function readProviderUsageAnalytics(dependencies: ProviderUsageAnalyticsDependencies = {}): Promise<ProviderUsageResponse> {
  const readModel = await (dependencies.readModelReader ?? readAnalyticsReadModel)()
  const env = dependencies.env ?? process.env
  const now = dependencies.now ?? new Date()
  const vaultRoot = dependencies.vaultRoot ?? resolveVaultWorkspaceRoot(undefined, env)
  const providers = [...new Set(readModel.agents.map((agent) => agent.provider).filter((provider) => provider.trim().length > 0))]
  const providerQuotaRows = await Promise.all(providers.map((provider) => readCachedProviderQuota(provider, env)))
  const providerQuotaById = new Map(providerQuotaRows.map((row) => [row.provider, row] as const))

  const cutoffDay = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)
  const sessionUsageByAgent = await aggregateSessionUsage(readModel.tasks, cutoffDay, vaultRoot, dependencies)
  const agents = readModel.agents.map((agent) => {
    const taskUsage = aggregateTaskUsage(agent.id, readModel.tasks, cutoffDay)
    const usage = sessionUsageByAgent.get(agent.id) ?? taskUsage

    return {
      agentId: agent.id,
      agentName: agent.name,
      provider: agent.provider,
      model: agent.model,
      recentCostUsd: usage.recentCostUsd,
      recentTokensUsed: usage.recentTokensUsed,
      recentTaskCount: usage.recentTaskCount,
      byDay: usage.byDay,
      providerQuota: providerQuotaById.get(agent.provider) ?? null,
    } satisfies AgentProviderUsageSummary
  })

  return {
    generatedAt: new Date().toISOString(),
    providers: providerQuotaRows.sort((left, right) => left.label.localeCompare(right.label)),
    agents: agents.sort((left, right) => left.agentName.localeCompare(right.agentName)),
  }
}
