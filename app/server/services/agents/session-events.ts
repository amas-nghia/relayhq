import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { DEFAULT_RUNNER_STALE_AFTER_MS } from "../runners/manager";

export interface AgentSessionEvent {
  readonly id: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly taskId: string | null;
  readonly type: 'session.started' | 'session.ended' | 'session.failed' | 'session.stopped' | 'session.usage' | 'terminal.stdout' | 'terminal.stderr' | 'reasoning.summary' | 'user.message';
  readonly timestamp: string;
  readonly text?: string;
  readonly code?: number | null;
  readonly usage?: AgentSessionUsageRecord;
}

export type AgentSessionUsageSource = 'provider' | 'runtime' | 'estimated';

export interface AgentSessionUsageRecord {
  readonly promptTokens?: number | null;
  readonly completionTokens?: number | null;
  readonly totalTokens?: number | null;
  readonly costUsd?: number | null;
  readonly model?: string | null;
  readonly usageSource: AgentSessionUsageSource;
  readonly estimatedRemainingContextTokens?: number | null;
  readonly contextWindowTokens?: number | null;
}

export interface AgentSessionUsageSummary {
  readonly sessionId: string;
  readonly agentId: string | null;
  readonly taskId: string | null;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
  readonly costUsd: number | null;
  readonly model: string | null;
  readonly usageSource: AgentSessionUsageSource | null;
  readonly estimatedRemainingContextTokens: number | null;
  readonly contextWindowTokens: number | null;
  readonly isEstimated: boolean;
}

export interface RecordedAgentSessionSummary {
  readonly sessionId: string;
  readonly agentId: string | null;
  readonly taskId: string | null;
  readonly launchMode: 'fresh' | 'resume';
  readonly runtimeKind: string | null;
  readonly command: string | null;
  readonly startTime: string;
  readonly lastEventAt: string;
  readonly status: 'starting' | 'running' | 'handed-off' | 'completed' | 'failed' | 'stopped';
}

function isRecordedSessionStale(lastEventAt: string, nowMs: number, staleAfterMs: number): boolean {
  const lastEventAtMs = Date.parse(lastEventAt)
  if (Number.isNaN(lastEventAtMs)) return true
  return nowMs - lastEventAtMs > staleAfterMs
}

function resolveEventLogPath(vaultRoot: string, sessionId: string): string {
  return join(vaultRoot, 'vault', 'shared', 'threads', `agent-session-${sessionId}.jsonl`)
}

function normalizeText(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '').trim()
}

function estimateTokensFromText(value: string): number {
  const normalized = normalizeText(value)
  if (normalized.length === 0) return 0
  return Math.max(1, Math.ceil(normalized.length / 4))
}

function parseSessionStartedText(text: string | undefined): { launchMode: 'fresh' | 'resume'; runtimeKind: string | null; command: string | null } {
  const normalized = typeof text === 'string' ? normalizeText(text) : ''
  const match = normalized.match(/^Launch\s+(fresh|resume)\s+via\s+([^:]+):\s*(.+)$/i)
  if (!match) {
    return { launchMode: 'fresh', runtimeKind: null, command: null }
  }

  return {
    launchMode: match[1]?.toLowerCase() === 'resume' ? 'resume' : 'fresh',
    runtimeKind: match[2]?.trim() || null,
    command: match[3]?.trim() || null,
  }
}

function roundCost(value: number): number {
  return Number(value.toFixed(6))
}

function estimateCostUsd(model: string | null, promptTokens: number | null, completionTokens: number | null): number | null {
  if (!model || promptTokens === null || completionTokens === null) return null

  const normalized = model.toLowerCase()
  const isMini = normalized.includes('gpt-4o-mini') || /gpt-5(?:\.\d+)?-mini\b/.test(normalized)
  const isStandard = (normalized.includes('gpt-4o') && !normalized.includes('gpt-4o-mini')) || /gpt-5(?:\.\d+)?(?:-(?:fast|pro))?\b/.test(normalized)
  const pricing = normalized.includes('claude-opus')
    ? { inputPerMillion: 15, outputPerMillion: 75 }
    : normalized.includes('claude-sonnet')
      ? { inputPerMillion: 3, outputPerMillion: 15 }
      : normalized.includes('claude-haiku')
        ? { inputPerMillion: 0.8, outputPerMillion: 4 }
        : isMini
          ? { inputPerMillion: 0.15, outputPerMillion: 0.6 }
          : isStandard
            ? { inputPerMillion: 2.5, outputPerMillion: 10 }
            : null

  if (pricing === null) return null

  return roundCost(
    (promptTokens * pricing.inputPerMillion) / 1_000_000
    + (completionTokens * pricing.outputPerMillion) / 1_000_000,
  )
}

function sumNullable(left: number | null, right: number | null | undefined): number | null {
  if (right === null || right === undefined) return left
  if (left === null) return right
  return left + right
}

const eventLogWriteChains = new Map<string, Promise<void>>()

export async function appendAgentSessionEvent(vaultRoot: string, event: Omit<AgentSessionEvent, 'id'>): Promise<void> {
  const filePath = resolveEventLogPath(vaultRoot, event.sessionId)
  const record: AgentSessionEvent = {
    ...event,
    id: `${event.sessionId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    ...(event.text === undefined ? {} : { text: normalizeText(event.text) }),
  }
  const line = `${JSON.stringify(record)}\n`
  const previousWrite = eventLogWriteChains.get(filePath) ?? Promise.resolve()
  const nextWrite = previousWrite
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(filePath), { recursive: true })
      await appendFile(filePath, line, 'utf8')
    })
  eventLogWriteChains.set(filePath, nextWrite)
  await nextWrite
}

export async function readAgentSessionEvents(vaultRoot: string, sessionId: string): Promise<ReadonlyArray<AgentSessionEvent>> {
  const filePath = resolveEventLogPath(vaultRoot, sessionId)
  try {
    const content = await readFile(filePath, 'utf8')
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as AgentSessionEvent]
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}

export function summarizeRecordedAgentSession(
  events: ReadonlyArray<AgentSessionEvent>,
  sessionId: string,
  options: { now?: Date; staleAfterMs?: number } = {},
): RecordedAgentSessionSummary | null {
  if (events.length === 0) return null

  const firstEvent = events[0]!
  const lastEvent = events[events.length - 1]!
  const startedEvent = events.find((event) => event.type === 'session.started')
  const started = parseSessionStartedText(startedEvent?.text)
  const ended = events.some((event) => event.type === 'session.ended')
  const failed = events.some((event) => event.type === 'session.failed')
  const stopped = events.some((event) => event.type === 'session.stopped')
  const nowMs = (options.now ?? new Date()).getTime()
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_RUNNER_STALE_AFTER_MS
  const stale = !ended && !failed && isRecordedSessionStale(lastEvent.timestamp, nowMs, staleAfterMs)

  return {
    sessionId,
    agentId: firstEvent.agentId ?? null,
    taskId: events.find((event) => event.taskId !== null)?.taskId ?? null,
    launchMode: started.launchMode,
    runtimeKind: started.runtimeKind,
    command: started.command,
    startTime: startedEvent?.timestamp ?? firstEvent.timestamp,
    lastEventAt: lastEvent.timestamp,
    status: stopped ? 'stopped' : failed ? 'failed' : ended ? 'completed' : stale ? 'stopped' : 'running',
  }
}

export async function readRecordedAgentSession(vaultRoot: string, sessionId: string): Promise<RecordedAgentSessionSummary | null> {
  const events = await readAgentSessionEvents(vaultRoot, sessionId)
  return summarizeRecordedAgentSession(events, sessionId)
}

export async function listRecordedAgentSessions(vaultRoot: string, agentId?: string): Promise<ReadonlyArray<RecordedAgentSessionSummary>> {
  const threadsPath = join(vaultRoot, 'vault', 'shared', 'threads')

  let entries: string[] = []
  try {
    entries = await readdir(threadsPath)
  } catch {
    return []
  }

  const sessions = await Promise.all(entries
    .filter((entry) => entry.startsWith('agent-session-') && entry.endsWith('.jsonl'))
    .map(async (entry) => {
      const sessionId = entry.slice('agent-session-'.length, -'.jsonl'.length)
      return await readRecordedAgentSession(vaultRoot, sessionId)
    }))

  return sessions
    .filter((session): session is RecordedAgentSessionSummary => session !== null)
    .filter((session) => agentId === undefined || session.agentId === agentId)
    .sort((left, right) => right.startTime.localeCompare(left.startTime))
}

export function summarizeAgentSessionUsage(events: ReadonlyArray<AgentSessionEvent>, sessionId: string): AgentSessionUsageSummary {
  let agentId: string | null = null
  let taskId: string | null = null
  let actualPromptTokens: number | null = null
  let actualCompletionTokens: number | null = null
  let actualTotalTokens: number | null = null
  let actualCostUsd: number | null = null
  let latestEstimatedUsage: AgentSessionUsageRecord | null = null
  let latestModel: string | null = null
  let latestActualSource: AgentSessionUsageSource | null = null
  let estimatedCompletionTokens = 0

  for (const event of events) {
    agentId = agentId ?? event.agentId
    taskId = taskId ?? event.taskId

    if (event.type === 'session.usage' && event.usage) {
      latestModel = event.usage.model ?? latestModel
      if (event.usage.usageSource === 'estimated') {
        latestEstimatedUsage = event.usage
      } else {
        latestActualSource = event.usage.usageSource
        actualPromptTokens = sumNullable(actualPromptTokens, event.usage.promptTokens)
        actualCompletionTokens = sumNullable(actualCompletionTokens, event.usage.completionTokens)
        actualTotalTokens = sumNullable(actualTotalTokens, event.usage.totalTokens)
        actualCostUsd = sumNullable(actualCostUsd, event.usage.costUsd)
      }
      continue
    }

    if (event.type === 'reasoning.summary' || event.type === 'terminal.stdout' || event.type === 'terminal.stderr') {
      estimatedCompletionTokens += estimateTokensFromText(event.text ?? '')
    }
  }

  const estimatedPromptTokens = latestEstimatedUsage?.promptTokens ?? null
  const fallbackCompletionTokens = estimatedCompletionTokens > 0 ? estimatedCompletionTokens : null
  const promptTokens = actualPromptTokens ?? estimatedPromptTokens
  const completionTokens = actualCompletionTokens ?? fallbackCompletionTokens
  const totalTokens = actualTotalTokens ?? (promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : latestEstimatedUsage?.totalTokens ?? null)
  const costUsd = actualCostUsd ?? estimateCostUsd(latestModel, promptTokens, completionTokens)
  const usageSource = latestActualSource ?? latestEstimatedUsage?.usageSource ?? null
  const hasActualUsage = actualPromptTokens !== null || actualCompletionTokens !== null || actualTotalTokens !== null || actualCostUsd !== null

  return {
    sessionId,
    agentId,
    taskId,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
    model: latestModel,
    usageSource,
    estimatedRemainingContextTokens: latestEstimatedUsage?.estimatedRemainingContextTokens ?? null,
    contextWindowTokens: latestEstimatedUsage?.contextWindowTokens ?? null,
    isEstimated: !hasActualUsage && (promptTokens !== null || completionTokens !== null || totalTokens !== null || costUsd !== null),
  }
}

export async function readAgentSessionUsage(vaultRoot: string, sessionId: string): Promise<AgentSessionUsageSummary> {
  const events = await readAgentSessionEvents(vaultRoot, sessionId)
  return summarizeAgentSessionUsage(events, sessionId)
}
