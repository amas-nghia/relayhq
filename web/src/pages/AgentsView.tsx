import { Activity, ArrowRight, Circle, Clock3, Coins, Pencil, Play, ScanSearch, TrendingUp, X } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'

import { relayhqApi, type AgentActivityEvent, type AnalyticsDashboardResponse } from '../api/client'
import { useAppStore } from '../store/appStore'
import { Button } from '../components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogOverlay, DialogPanel, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { useNavigate } from 'react-router-dom'

function AgentFeedPanel() {
  const agents = useAppStore(state => state.agents)
  const tasks = useAppStore(state => state.tasks)
  const projects = useAppStore(state => state.projects)
  const activeAgents = agents.filter(agent => agent.state !== 'idle')

  if (activeAgents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-text-tertiary">
        No active agents right now. When an agent claims work, its live feed card will show up here.
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {activeAgents.map(agent => {
        const task = tasks.find(t => t.assigneeId === agent.id && t.status !== 'done' && t.status !== 'cancelled')
        const project = task ? projects.find(entry => entry.id === task.projectId) : null
        const pulseTone = agent.state === 'active' ? 'bg-status-done' : 'bg-status-waiting'

        return (
          <div key={agent.id} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className={clsx('absolute inset-0 animate-pulse-agent rounded-full opacity-60', pulseTone)} />
                  <span className={clsx('relative h-3 w-3 rounded-full', pulseTone)} />
                </span>
                <div>
                  <div className="text-sm font-semibold text-text-primary">{agent.name}</div>
                  <div className="text-xs text-text-tertiary">{agent.state}</div>
                </div>
              </div>
              <span className="text-xs text-text-secondary">{agent.lastHeartbeat}</span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Current task</div>
                <div className="mt-1 text-sm text-text-primary">{task?.title || 'No claimed task'}</div>
                <div className="text-xs text-text-secondary">{project?.name || 'No project context'}</div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-text-secondary">
                  <span>Progress</span>
                  <span>{task?.progress ?? 0}%</span>
                </div>
                <div className="h-2 rounded-full bg-border">
                  <div className="h-2 rounded-full bg-status-active" style={{ width: `${task?.progress ?? 0}%` }} />
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function eventIcon(eventType: string) {
  if (eventType === 'session_start') return <Play className="h-3.5 w-3.5 text-brand" />
  if (eventType === 'heartbeat') return <Clock3 className="h-3.5 w-3.5 text-status-active" />
  if (eventType === 'approval_requested') return <ArrowRight className="h-3.5 w-3.5 text-status-waiting" />
  if (eventType === 'task_completed') return <Circle className="h-3.5 w-3.5 fill-current text-status-done" />
  return <Activity className="h-3.5 w-3.5 text-text-tertiary" />
}

function eventLabel(eventType: string) {
  if (eventType === 'session_start') return 'Session started'
  if (eventType === 'heartbeat') return 'Heartbeat'
  if (eventType === 'approval_requested') return 'Approval requested'
  if (eventType === 'task_completed') return 'Task completed'
  if (eventType === 'task_claimed') return 'Task claimed'
  return eventType.replace(/_/g, ' ')
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`
}

function formatPercent(value: number | null) {
  return value == null ? '—' : `${value.toFixed(1)}%`
}

function formatDays(value: number | null) {
  return value == null ? '—' : `${value.toFixed(value >= 10 ? 0 : 1)}d`
}

function formatShortDay(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatShortWeek(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function renderSparkline(points: ReadonlyArray<number>) {
  if (points.length === 0) {
    return null
  }

  const max = Math.max(...points, 1)
  const coordinates = points.map((value, index) => {
    const x = points.length === 1 ? 100 : (index / (points.length - 1)) * 100
    const y = 100 - (value / max) * 100
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-28 w-full overflow-visible">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coordinates}
        className="text-brand"
      />
    </svg>
  )
}

function AnalyticsPanel(props: {
  summary: AnalyticsDashboardResponse | null
  loading: boolean
  error: string | null
}) {
  const { summary, loading, error } = props
  const cost = summary?.cost ?? null
  const velocity = summary?.velocity ?? null
  const agents = summary?.agents ?? null

  const costTrend = useMemo(() => cost?.byDay.slice(-14) ?? [], [cost])
  const weeklyVelocity = useMemo(() => velocity?.completedPerWeek.slice(-8) ?? [], [velocity])
  const scorecards = agents?.scorecards ?? []
  const highestProjectCost = Math.max(...(cost?.byProject.map(entry => entry.costUsd) ?? [0]), 0)
  const highestWeeklyVelocity = Math.max(...weeklyVelocity.map(entry => entry.completedCount), 0)

  if (loading && !cost && !velocity && !agents) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-text-secondary">
        Loading analytics…
      </div>
    )
  }

  if (error && !cost && !velocity && !agents) {
    return (
      <div className="rounded-2xl border border-status-blocked/40 bg-surface p-6 text-sm text-status-blocked">
        {error}
      </div>
    )
  }

  if (!cost || !velocity || !agents) {
    return null
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-status-blocked/40 bg-surface px-4 py-3 text-sm text-status-blocked">{error}</div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Total cost</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">{formatCurrency(cost.totals.costUsd)}</div>
          <div className="mt-1 text-xs text-text-secondary">{cost.totals.tokensUsed.toLocaleString()} tokens</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Completed tasks</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">{velocity.totals.completedCount}</div>
          <div className="mt-1 text-xs text-text-secondary">{cost.totals.taskCount} costed completions</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary">P50 completion time</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">{formatDays(velocity.totals.p50DaysToComplete)}</div>
          <div className="mt-1 text-xs text-text-secondary">P95 {formatDays(velocity.totals.p95DaysToComplete)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Stuck tasks</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">{agents.totals.stuckTaskCount}</div>
          <div className="mt-1 text-xs text-text-secondary">Across {agents.totals.agentCount} agents</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">Cost trend</div>
              <div className="text-xs text-text-secondary">Daily completed-task spend over the last {Math.max(costTrend.length, 1)} days with data.</div>
            </div>
            <TrendingUp className="h-4 w-4 text-brand" />
          </div>

          {costTrend.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-tertiary">No completed task cost data yet.</div>
          ) : (
            <>
              <div className="rounded-xl bg-surface-secondary/80 p-3 text-brand">
                {renderSparkline(costTrend.map(entry => entry.costUsd))}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {costTrend.slice(-4).map(entry => (
                  <div key={entry.day} className="rounded-xl border border-border bg-surface-secondary/60 p-3">
                    <div className="text-xs text-text-tertiary">{formatShortDay(entry.day)}</div>
                    <div className="mt-1 text-base font-semibold text-text-primary">{formatCurrency(entry.costUsd)}</div>
                    <div className="text-xs text-text-secondary">{entry.taskCount} tasks · {entry.tokensUsed.toLocaleString()} tokens</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="mb-4 text-sm font-semibold text-text-primary">Cost by project</div>
          <div className="space-y-3">
            {cost.byProject.length === 0 && <div className="text-sm text-text-tertiary">No completed cost data yet.</div>}
            {cost.byProject.slice(0, 6).map(entry => {
              const width = highestProjectCost > 0 ? (entry.costUsd / highestProjectCost) * 100 : 0
              return (
                <div key={entry.projectId} className="rounded-xl border border-border bg-surface-secondary/60 p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-text-primary">{entry.projectName}</span>
                    <span className="text-text-secondary">{formatCurrency(entry.costUsd)}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-border">
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${width}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-text-secondary">{entry.taskCount} tasks · {entry.tokensUsed.toLocaleString()} tokens</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.9fr]">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="mb-4 text-sm font-semibold text-text-primary">Velocity</div>
          <div className="space-y-3">
            {weeklyVelocity.length === 0 && <div className="text-sm text-text-tertiary">No completed work yet.</div>}
            {weeklyVelocity.map(entry => {
              const width = highestWeeklyVelocity > 0 ? (entry.completedCount / highestWeeklyVelocity) * 100 : 0
              return (
                <div key={entry.weekStart} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span>{formatShortWeek(entry.weekStart)}</span>
                    <span>{entry.completedCount} completed</span>
                  </div>
                  <div className="h-2 rounded-full bg-border">
                    <div className="h-2 rounded-full bg-status-active" style={{ width: `${width}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">Agent scorecard</div>
              <div className="text-xs text-text-secondary">Delivery, spend, approvals, and stuck work by agent.</div>
            </div>
            <div className="text-xs text-text-secondary">{agents.totals.activeTaskCount} active / waiting</div>
          </div>

          {scorecards.length === 0 ? (
            <div className="text-sm text-text-tertiary">No agent analytics available yet.</div>
          ) : (
            <div className="space-y-3">
              {scorecards.map(entry => {
                const budgetUsage = entry.monthlyBudgetUsd && entry.monthlyBudgetUsd > 0
                  ? Math.min(100, Math.max(0, (entry.monthlyCostUsd / entry.monthlyBudgetUsd) * 100))
                  : 0

                return (
                  <div key={entry.agentId} className="rounded-xl border border-border bg-surface-secondary/60 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-text-primary">{entry.agentName}</span>
                          <span className="text-xs text-text-tertiary">{entry.agentId}</span>
                          {entry.provider && <span className="text-xs text-text-tertiary">• {entry.provider}</span>}
                          {entry.model && <span className="text-xs text-text-tertiary">• {entry.model}</span>}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-text-secondary">
                          <span>{entry.completedTaskCount}/{entry.taskCount} completed</span>
                          <span>•</span>
                          <span>{formatCurrency(entry.costUsd)}</span>
                          <span>•</span>
                          <span>{entry.tokensUsed.toLocaleString()} tokens</span>
                          <span>•</span>
                          <span>avg {formatDays(entry.avgCompletionDays)}</span>
                          <span>•</span>
                          <span>approval {formatPercent(entry.approvalRate)}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs xl:min-w-[220px]">
                        <div className="rounded-lg bg-surface px-3 py-2">
                          <div className="text-text-tertiary">Active</div>
                          <div className="mt-1 font-semibold text-text-primary">{entry.activeTaskCount}</div>
                        </div>
                        <div className="rounded-lg bg-surface px-3 py-2">
                          <div className="text-text-tertiary">Waiting</div>
                          <div className="mt-1 font-semibold text-text-primary">{entry.waitingApprovalCount}</div>
                        </div>
                        <div className="rounded-lg bg-surface px-3 py-2">
                          <div className="text-text-tertiary">Stuck</div>
                          <div className={clsx('mt-1 font-semibold', entry.stuckCount > 0 ? 'text-status-blocked' : 'text-text-primary')}>{entry.stuckCount}</div>
                        </div>
                      </div>
                    </div>

                    {entry.monthlyBudgetUsd != null && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs text-text-secondary">
                          <span>Monthly spend {formatCurrency(entry.monthlyCostUsd)} / {formatCurrency(entry.monthlyBudgetUsd)}</span>
                          <span className={clsx(entry.remainingBudgetUsd != null && entry.remainingBudgetUsd < 0 && 'text-status-blocked')}>
                            {entry.remainingBudgetUsd == null ? '—' : `${formatCurrency(entry.remainingBudgetUsd)} left`}
                          </span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-border">
                          <div className={clsx('h-2 rounded-full', entry.remainingBudgetUsd != null && entry.remainingBudgetUsd < 0 ? 'bg-status-blocked' : 'bg-status-active')} style={{ width: `${budgetUsage}%` }} />
                        </div>
                      </div>
                    )}

                    {entry.lastCompletedAt && <div className="mt-3 text-xs text-text-tertiary">Last completion {new Date(entry.lastCompletedAt).toLocaleString()}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function AgentsView() {
  const agents = useAppStore(state => state.agents)
  const tasks = useAppStore(state => state.tasks)
  const projects = useAppStore(state => state.projects)
  const navigate = useNavigate()
  const loadData = useAppStore(state => state.loadData)
  const activeAgents = agents.filter(a => a.state !== 'idle')
  const idleAgents = agents.filter(a => a.state === 'idle')
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [agentName, setAgentName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [apiKeyRef, setApiKeyRef] = useState('')
  const [monthlyBudgetUsd, setMonthlyBudgetUsd] = useState('')
  const [capabilities, setCapabilities] = useState('')
  const [approvalRequiredFor, setApprovalRequiredFor] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [tab, setTab] = useState<'activity' | 'analytics'>('activity')
  const [activityByAgent, setActivityByAgent] = useState<Record<string, ReadonlyArray<AgentActivityEvent>>>({})
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsDashboardResponse | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

  const editingAgent = agents.find(agent => agent.id === editingAgentId) ?? null

  async function handleScan() {
    setIsScanning(true)
    try {
      const response = await relayhqApi.scanAgents()
      const toolIds = response.discovered.filter(tool => tool.detected && !tool.alreadyRegistered).map(tool => tool.id)
      if (toolIds.length > 0) {
        await relayhqApi.registerAgents({ toolIds })
        await loadData()
      }
    } finally {
      setIsScanning(false)
    }
  }

  function startEdit(agentId: string) {
    const agent = agents.find(entry => entry.id === agentId)
    if (!agent) return
    setEditingAgentId(agentId)
    setAgentName(agent.name)
    setAccountId(agent.accountId ?? '')
    setApiKeyRef(agent.apiKeyRef ?? '')
    setMonthlyBudgetUsd(agent.monthlyBudgetUsd != null ? String(agent.monthlyBudgetUsd) : '')
    setCapabilities((agent.capabilities ?? []).join('\n'))
    setApprovalRequiredFor((agent.approvalRequiredFor ?? []).join('\n'))
  }

  async function saveAgent() {
    if (!editingAgentId) return
    setIsSaving(true)
    try {
      await relayhqApi.patchAgent(editingAgentId, {
        patch: {
          name: agentName,
          account_id: accountId || undefined,
          api_key_ref: apiKeyRef || undefined,
          monthly_budget_usd: monthlyBudgetUsd.trim().length > 0 ? Number(monthlyBudgetUsd) : undefined,
          capabilities: capabilities.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
          approval_required_for: approvalRequiredFor.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
        },
      })
      await loadData()
      setEditingAgentId(null)
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    if (tab !== 'activity') return
    void Promise.all(agents.map(async (agent) => [agent.id, await relayhqApi.getAgentActivity(agent.id)] as const)).then(entries => {
      setActivityByAgent(Object.fromEntries(entries))
    })
  }, [agents, tab])

  useEffect(() => {
    if (tab !== 'analytics') return

    let cancelled = false
    setAnalyticsLoading(true)
    setAnalyticsError(null)

    void relayhqApi.getAnalyticsSummary()
      .then((dashboard) => {
        if (cancelled) return
        setAnalyticsSummary(dashboard)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setAnalyticsError(error instanceof Error ? error.message : 'Failed to load analytics.')
      })
      .finally(() => {
        if (cancelled) return
        setAnalyticsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tab])

  return (
    <div className="flex min-h-full w-full flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-text-primary">Agents</h1>
          <p className="text-sm text-text-secondary">
            {activeAgents.length} active / {agents.length} total
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void handleScan()} disabled={isScanning}>
          <ScanSearch className="h-4 w-4" /> {isScanning ? 'Scanning...' : 'Scan for installed tools'}
        </Button>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex w-fit gap-2 rounded-xl border border-border bg-surface p-1">
          <Button type="button" variant={tab === 'activity' ? 'secondary' : 'ghost'} onClick={() => setTab('activity')}>Activity</Button>
          <Button type="button" variant={tab === 'analytics' ? 'secondary' : 'ghost'} onClick={() => setTab('analytics')}><Coins className="h-4 w-4" /> Analytics</Button>
        </div>

        {tab === 'analytics' && (
          <AnalyticsPanel
            summary={analyticsSummary}
            loading={analyticsLoading}
            error={analyticsError}
          />
        )}

        {tab === 'activity' && (
          <>
            <div className="flex flex-col gap-3">
              <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">
                AGENT ACTIVITY
              </h3>
              <AgentFeedPanel />
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">
                ACTIVE AGENTS
              </h3>
              <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface divide-y divide-border">
                {activeAgents.map(agent => {
                  const task = tasks.find(t => t.assigneeId === agent.id && (t.status === 'in-progress' || t.status === 'waiting-approval' || t.status === 'blocked'))
                  const project = task ? projects.find(p => p.id === task.projectId) : null

                  const isGreen = agent.state === 'active'
                  const isYellow = agent.state === 'waiting'
                  const isRed = agent.state === 'stale'

                  return (
                    <div key={agent.id} className="group flex cursor-pointer flex-col gap-2 p-4 transition-colors hover:bg-surface-secondary">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <div className="relative flex">
                            <Circle className={clsx('h-3 w-3 fill-current', isGreen ? 'text-status-done' : isYellow ? 'text-status-waiting' : isRed ? 'text-status-blocked' : 'text-text-tertiary')} />
                            {isGreen && (
                              <span className="absolute inset-0 block animate-pulse-agent rounded-full bg-status-done opacity-50 shadow-[0_0_8px_rgba(22,163,74,0.8)]" />
                            )}
                          </div>
                          <span className="text-sm font-semibold text-text-primary">{agent.name}</span>
                          {(agent.accountId || agent.provider) && (
                            <span className="text-xs text-text-tertiary">{agent.provider}{agent.accountId ? `/${agent.accountId}` : ''}</span>
                          )}
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => startEdit(agent.id)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {task && (
                          <span className={clsx('text-[11px] font-bold uppercase tracking-wider', isYellow && 'text-status-waiting', isRed && 'text-status-blocked', isGreen && 'text-transparent')}>
                            {task.status.replace('-', ' ')}
                          </span>
                        )}
                      </div>

                      {task && (
                        <div className="flex items-start gap-4">
                          <div className="w-5 shrink-0" />
                          <div className="flex flex-1 flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
                              {task.title} <span className="font-normal text-text-tertiary">•</span> <span className="font-normal text-text-secondary">{project?.name}</span>
                            </div>

                            {agent.state === 'active' && (
                              <div className="flex items-center gap-3 text-xs text-text-secondary">
                                <div className="h-1.5 w-32 flex-shrink-0 overflow-hidden rounded-full bg-border">
                                  <div className="h-full bg-status-active" style={{ width: `${task.progress}%` }} />
                                </div>
                                <span className="font-medium">{task.progress}%</span>
                                <span className="text-text-tertiary">•</span>
                                <span>last heartbeat: {agent.lastHeartbeat}</span>
                              </div>
                            )}

                            {agent.state === 'waiting' && (
                              <div className="flex items-center gap-3 text-xs text-text-secondary">
                                <span>Waiting for approval since {agent.lastHeartbeat}</span>
                                <button onClick={(event) => { event.stopPropagation(); navigate(`/tasks/${task.id}`) }} className="flex items-center gap-1 font-medium text-accent transition-colors hover:text-accent-light">
                                  Review approval <ArrowRight className="h-3 w-3" />
                                </button>
                              </div>
                            )}

                            {agent.state === 'stale' && (
                              <div className="flex items-center gap-3 text-xs text-text-secondary">
                                <span>Last heartbeat: {agent.lastHeartbeat}</span>
                                <button className="flex items-center gap-1 font-medium text-status-blocked transition-colors hover:text-red-700">
                                  Mark as blocked
                                </button>
                              </div>
                            )}

                            <div className="space-y-1 rounded-lg bg-surface-secondary/80 p-3">
                              <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Timeline</div>
                              {(activityByAgent[agent.id] ?? []).slice(0, 10).map((event, index) => (
                                <div key={`${event.timestamp}-${index}`} className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                                  <span className="inline-flex items-center gap-2">
                                    {eventIcon(event.event_type)}
                                    {eventLabel(event.event_type)}
                                  </span>
                                  <span>{new Date(event.timestamp).toLocaleString()}</span>
                                </div>
                              ))}
                              {(activityByAgent[agent.id] ?? []).length === 0 && <div className="text-xs text-text-tertiary">No recent activity. Last seen {agent.lastHeartbeat}.</div>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">
                IDLE AGENTS
              </h3>
              <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface divide-y divide-border">
                {idleAgents.map(agent => (
                  <div key={agent.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-surface-secondary">
                    <div className="flex items-center gap-2 text-sm text-text-secondary">
                      <Circle className="h-3 w-3 fill-current text-text-tertiary" />
                      <span className="inline-block w-32 font-semibold text-text-primary">{agent.name}</span>
                      {(agent.accountId || agent.provider) && <span className="text-text-tertiary">{agent.provider}{agent.accountId ? `/${agent.accountId}` : ''}</span>}
                      <span className="text-text-tertiary">•</span>
                      <span className="text-text-tertiary">Idle</span>
                      <span className="text-text-tertiary">•</span>
                      <span>No active task</span>
                      <span className="text-text-tertiary">•</span>
                      <span>Last seen {agent.lastHeartbeat}</span>
                      <Button type="button" variant="ghost" size="icon" className="ml-auto" onClick={() => startEdit(agent.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="ml-5 space-y-1 rounded-lg bg-surface-secondary/80 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Timeline</div>
                      {(activityByAgent[agent.id] ?? []).slice(0, 10).map((event, index) => (
                        <div key={`${event.timestamp}-${index}`} className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                          <span className="inline-flex items-center gap-2">
                            {eventIcon(event.event_type)}
                            {eventLabel(event.event_type)}
                          </span>
                          <span>{new Date(event.timestamp).toLocaleString()}</span>
                        </div>
                      ))}
                      {(activityByAgent[agent.id] ?? []).length === 0 && <div className="text-xs text-text-tertiary">No recent activity. Last seen {agent.lastHeartbeat}.</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {editingAgent && (
        <Dialog open>
          <DialogOverlay onClick={() => setEditingAgentId(null)} />
          <DialogContent>
            <DialogPanel className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit agent</DialogTitle>
                <Button variant="ghost" size="icon" onClick={() => setEditingAgentId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogHeader>
              <DialogBody>
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Name
                    <Input value={agentName} onChange={event => setAgentName(event.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Account id
                    <Input value={accountId} onChange={event => setAccountId(event.target.value)} placeholder="codex-account-1" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    API key ref
                    <Input value={apiKeyRef} onChange={event => setApiKeyRef(event.target.value)} placeholder="env:OPENAI_API_KEY_ACCOUNT_1" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Monthly budget USD
                    <Input value={monthlyBudgetUsd} onChange={event => setMonthlyBudgetUsd(event.target.value)} placeholder="25" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Capabilities
                    <Textarea value={capabilities} onChange={event => setCapabilities(event.target.value)} rows={4} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Approval required for
                    <Textarea value={approvalRequiredFor} onChange={event => setApprovalRequiredFor(event.target.value)} rows={3} />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditingAgentId(null)}>Cancel</Button>
                    <Button type="button" onClick={() => void saveAgent()} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>
                  </div>
                </div>
              </DialogBody>
            </DialogPanel>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
