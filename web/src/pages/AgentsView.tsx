import { Square, Play, Plus, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'

import { relayhqApi, type AgentRuntimeReadinessResponse, type AgentSessionEventRecord, type AgentSessionRecord, type AgentStateResponse } from '../api/client'
import { useAppStore } from '../store/appStore'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { AgentSetupWizard } from '../components/layout/AgentSetupWizard'
import { RuntimeTruthBadges, RuntimeTruthMessage } from '../components/agent/RuntimeTruth'
import type { Agent } from '../types'

export function AgentsView() {
  const agents = useAppStore(state => state.agents).filter(
    agent => agent.role !== 'coordinator' && !(agent.roles ?? []).includes('coordinator'),
  )
  const tasks = useAppStore(state => state.tasks)
  const loadData = useAppStore(state => state.loadData)

  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [isNewAgentOpen, setIsNewAgentOpen] = useState(false)
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null)
  const [runNowNotice, setRunNowNotice] = useState<string | null>(null)
  const [agentStates, setAgentStates] = useState<Record<string, AgentStateResponse>>({})
  const [runtimeReadiness, setRuntimeReadiness] = useState<Record<string, AgentRuntimeReadinessResponse>>({})
  const [sessionsByAgent, setSessionsByAgent] = useState<Record<string, ReadonlyArray<AgentSessionRecord>>>({})
  const [eventsBySession, setEventsBySession] = useState<Record<string, ReadonlyArray<AgentSessionEventRecord>>>({})
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({})
  const [runtimeLoadingAgentId, setRuntimeLoadingAgentId] = useState<string | null>(null)

  function getInboxCount(agentId: string) {
    return agentStates[agentId]?.inbox.length ?? tasks.filter(t => t.assigneeId === agentId && t.status === 'todo').length
  }

  function getCurrentTask(agentId: string) {
    return tasks.find(t => t.assigneeId === agentId && t.status !== 'done' && t.status !== 'cancelled') ?? null
  }

  async function loadInbox(agentId: string) {
    const state = await relayhqApi.getAgentState(agentId)
    setAgentStates(current => ({ ...current, [agentId]: state }))
    return state
  }

  async function loadSessions(agentId: string) {
    const sessions = await relayhqApi.listAgentSessions(agentId)
    setSessionsByAgent(current => ({ ...current, [agentId]: sessions }))
    return sessions
  }

  async function loadSessionEvents(sessionId: string) {
    const events = await relayhqApi.getAgentSessionEvents(sessionId)
    setEventsBySession(current => ({ ...current, [sessionId]: events }))
    return events
  }

  async function verifyRuntime(agentId: string) {
    setRuntimeLoadingAgentId(agentId)
    try {
      const readiness = await relayhqApi.getAgentRuntimeReadiness(agentId)
      setRuntimeReadiness(current => ({ ...current, [agentId]: readiness }))
      return readiness
    } finally {
      setRuntimeLoadingAgentId(current => (current === agentId ? null : current))
    }
  }

  async function sendSessionMessage(agentId: string) {
    const sessions = sessionsByAgent[agentId] ?? (await loadSessions(agentId))
    const session = sessions[0]
    const message = (messageDrafts[agentId] ?? '').trim()
    if (!session || message.length === 0) return
    setRunningAgentId(agentId)
    try {
      await relayhqApi.sendAgentSessionMessage(session.sessionId, message)
      setMessageDrafts(current => ({ ...current, [agentId]: '' }))
      await loadSessionEvents(session.sessionId)
    } finally {
      setRunningAgentId(null)
    }
  }

  async function handleRunNow(agentId: string) {
    setRunNowNotice(null)
    const state = agentStates[agentId] ?? (await relayhqApi.getAgentState(agentId))
    setAgentStates(current => ({ ...current, [agentId]: state }))
    const nextTask = state.inbox[0] ?? state.active
    if (!nextTask) {
      setRunNowNotice('No tasks assigned to this agent. Assign a task from the board first.')
      return
    }
    setRunningAgentId(agentId)
    try {
      await relayhqApi.runAgent(agentId, { taskId: nextTask.id, surface: 'background' })
      await loadData()
      await loadInbox(agentId)
      const sessions = await loadSessions(agentId)
      if (sessions[0]) await loadSessionEvents(sessions[0].sessionId)
    } catch (err) {
      setRunNowNotice(err instanceof Error ? err.message : 'Unable to run agent.')
    } finally {
      setRunningAgentId(null)
    }
  }

  async function resumeLatestSession(agentId: string) {
    const state = agentStates[agentId] ?? (await relayhqApi.getAgentState(agentId))
    setAgentStates(current => ({ ...current, [agentId]: state }))
    const sessions = sessionsByAgent[agentId] ?? (await loadSessions(agentId))
    const previousSession =
      sessions.find(s => s.status === 'running' || s.status === 'failed' || s.status === 'completed') ?? null
    const taskId = state.active?.id ?? state.inbox[0]?.id
    if (!taskId) return
    setRunningAgentId(agentId)
    try {
      await relayhqApi.resumeAgent(agentId, {
        taskId,
        previousSessionId: previousSession?.sessionId ?? null,
        surface: 'background',
      })
      await loadData()
      await loadInbox(agentId)
      const resumed = await loadSessions(agentId)
      if (resumed[0]) await loadSessionEvents(resumed[0].sessionId)
    } finally {
      setRunningAgentId(null)
    }
  }

  async function stopLatestSession(agentId: string) {
    const sessions = sessionsByAgent[agentId] ?? (await loadSessions(agentId))
    const running = sessions.find(s => s.status === 'running')
    if (!running) return
    setRunningAgentId(agentId)
    try {
      await relayhqApi.stopAgentSession(running.sessionId)
      await loadSessions(agentId)
      await loadData()
    } finally {
      setRunningAgentId(null)
    }
  }

  // Load detail data when selection changes
  useEffect(() => {
    if (!selectedAgentId) return
    void (async () => {
      const [, sessions] = await Promise.all([
        loadInbox(selectedAgentId),
        loadSessions(selectedAgentId),
        verifyRuntime(selectedAgentId),
      ])
      if (sessions[0]) await loadSessionEvents(sessions[0].sessionId)
    })()
  }, [selectedAgentId])

  // Poll session events for selected agent
  useEffect(() => {
    if (!selectedAgentId) return
    const id = window.setInterval(() => {
      void (async () => {
        const sessions = await loadSessions(selectedAgentId)
        if (sessions[0]) await loadSessionEvents(sessions[0].sessionId)
      })()
    }, 3000)
    return () => window.clearInterval(id)
  }, [selectedAgentId])

  // Group agents by state for sections
  const needsAttention = agents.filter(a => a.state === 'waiting' || a.state === 'stale')
  const working = agents.filter(a => a.state === 'active')
  const idle = agents.filter(a => !needsAttention.some(x => x.id === a.id) && !working.some(x => x.id === a.id))

  const selectedAgent = agents.find(a => a.id === selectedAgentId) ?? null
  const editingAgentRecord = agents.find(a => a.id === editingAgentId) ?? null

  function stateDotClass(state: Agent['state']) {
    if (state === 'active') return 'bg-status-done'
    if (state === 'waiting') return 'bg-status-waiting'
    if (state === 'stale') return 'bg-status-blocked'
    return 'bg-text-tertiary'
  }

  function renderAgentRow(agent: Agent) {
    const task = getCurrentTask(agent.id)
    const inboxCount = getInboxCount(agent.id)
    const isSelected = selectedAgentId === agent.id
    const isActive = agent.state === 'active'
    const dotClass = stateDotClass(agent.state)
    const subtitle = task
      ? task.title
      : inboxCount > 0
        ? `${inboxCount} task${inboxCount > 1 ? 's' : ''} waiting`
        : 'No tasks'

    return (
      <button
        key={agent.id}
        type="button"
        onClick={() => { setSelectedAgentId(agent.id); setRunNowNotice(null) }}
        className={clsx(
          'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-2',
          isSelected
            ? 'bg-surface-secondary border-l-brand'
            : 'border-l-transparent hover:bg-surface-secondary/50',
        )}
      >
        <span className="relative flex h-2 w-2 flex-none">
          {isActive && <span className={clsx('absolute inset-0 rounded-full opacity-60 animate-pulse-agent', dotClass)} />}
          <span className={clsx('relative h-2 w-2 rounded-full', dotClass)} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">{agent.name}</div>
          <div className="text-xs text-text-tertiary truncate">{subtitle}</div>
        </div>
        {inboxCount > 0 && !task && (
          <span className="flex-none rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">{inboxCount}</span>
        )}
      </button>
    )
  }

  // Derived detail state
  const detailSessions = selectedAgent ? (sessionsByAgent[selectedAgent.id] ?? []) : []
  const latestSession = detailSessions[0] ?? null
  const latestEvents = latestSession ? (eventsBySession[latestSession.sessionId] ?? []) : []
  const readiness = selectedAgent ? (runtimeReadiness[selectedAgent.id] ?? null) : null
  const agentState = selectedAgent ? (agentStates[selectedAgent.id] ?? null) : null
  const inboxCount = selectedAgent ? getInboxCount(selectedAgent.id) : 0
  const currentTask = selectedAgent ? getCurrentTask(selectedAgent.id) : null
  const canChat = latestSession?.launchSurface === 'background' && latestSession.status === 'running'
  const canRun =
    selectedAgent != null &&
    selectedAgent.state !== 'active' &&
    (inboxCount > 0 || currentTask?.status === 'todo' || currentTask?.status === 'in-progress')
  const canResume =
    latestSession != null &&
    latestSession.status !== 'running' &&
    (currentTask != null || (agentState?.inbox.length ?? 0) > 0)
  const canStop = latestSession?.status === 'running'

  return (
    <div className="flex w-full min-h-full">
      {/* ─── Left panel: Agent list ─── */}
      <div className="w-64 flex-none flex flex-col border-r border-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-none">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Agents</h2>
            <p className="text-xs text-text-tertiary">
              {agents.length === 0
                ? 'No agents yet'
                : [working.length > 0 && `${working.length} active`, idle.length > 0 && `${idle.length} idle`]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setIsNewAgentOpen(true)}>
            <Plus className="h-3 w-3" /> New
          </Button>
        </div>

        <div className="flex-1">
          {agents.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-text-tertiary mb-3">No agents configured yet.</p>
              <Button size="sm" onClick={() => setIsNewAgentOpen(true)}>
                Add first agent
              </Button>
            </div>
          ) : (
            <>
              {needsAttention.length > 0 && (
                <div>
                  <div className="px-4 pt-4 pb-1 text-[10px] uppercase tracking-[0.18em] text-status-blocked font-medium">
                    Needs Attention
                  </div>
                  {needsAttention.map(renderAgentRow)}
                </div>
              )}
              {working.length > 0 && (
                <div>
                  <div className="px-4 pt-4 pb-1 text-[10px] uppercase tracking-[0.18em] text-text-tertiary font-medium">
                    Working
                  </div>
                  {working.map(renderAgentRow)}
                </div>
              )}
              {idle.length > 0 && (
                <div>
                  <div className="px-4 pt-4 pb-1 text-[10px] uppercase tracking-[0.18em] text-text-tertiary font-medium">
                    Idle
                  </div>
                  {idle.map(renderAgentRow)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Right panel: Agent detail ─── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selectedAgent ? (
          <div className="flex h-full min-h-64 items-center justify-center">
            <p className="text-sm text-text-tertiary">Select an agent to view its status and controls</p>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3 flex-none">
                  {selectedAgent.state === 'active' && (
                    <span
                      className={clsx(
                        'absolute inset-0 rounded-full opacity-60 animate-pulse-agent',
                        stateDotClass(selectedAgent.state),
                      )}
                    />
                  )}
                  <span className={clsx('relative h-3 w-3 rounded-full', stateDotClass(selectedAgent.state))} />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-text-primary">{selectedAgent.name}</h2>
                  <p className="text-xs text-text-tertiary">
                    {[selectedAgent.provider, selectedAgent.model, selectedAgent.runMode].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditingAgentId(selectedAgent.id)}>
                Edit Config
              </Button>
            </div>

            {/* Notice strip */}
            {runNowNotice && (
              <div className="rounded border border-status-waiting/30 bg-status-waiting/10 px-4 py-3 text-sm text-status-waiting">
                {runNowNotice}
              </div>
            )}

            {/* Runtime */}
            <div className="border border-border rounded p-4 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.18em] text-text-tertiary font-medium mb-3">Runtime</div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Kind</span>
                <span className="font-medium text-text-primary">
                  {readiness?.runtimeKind ?? selectedAgent.runtimeKind ?? selectedAgent.runMode ?? '—'}
                </span>
              </div>
              <RuntimeTruthBadges agent={selectedAgent} readiness={readiness} className="mt-2" />
              <RuntimeTruthMessage agent={selectedAgent} readiness={readiness} className="mt-2" />
              {readiness?.reason && <p className="text-xs text-status-blocked mt-1">{readiness.reason}</p>}
            </div>

            {/* Current task */}
            <div className="border border-border rounded p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-text-tertiary font-medium mb-3">Current Task</div>
              {currentTask ? (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-text-primary">{currentTask.title}</div>
                  {currentTask.dispatchStatus && (
                    <div className="text-xs text-text-secondary">
                      Dispatch:{' '}
                      <span className="font-medium text-text-primary">{currentTask.dispatchStatus}</span>
                    </div>
                  )}
                  {currentTask.dispatchReason && (
                    <p className="text-xs text-text-tertiary">{currentTask.dispatchReason}</p>
                  )}
                  {currentTask.blockedReason && (
                    <p className="text-xs text-status-blocked">{currentTask.blockedReason}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-text-secondary">
                    <div className="h-1.5 flex-1 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full bg-status-active transition-all"
                        style={{ width: `${currentTask.progress}%` }}
                      />
                    </div>
                    <span className="flex-none">{currentTask.progress}%</span>
                  </div>
                  {currentTask.status === 'waiting-approval' && (
                    <div className="rounded border border-status-waiting/30 bg-status-waiting/10 px-3 py-2 text-xs text-status-waiting">
                      Waiting for human approval — review this task on the board to continue.
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-text-tertiary">No active task.</p>
                  {inboxCount > 0 && (
                    <p className="text-xs text-text-secondary">
                      {inboxCount} task{inboxCount > 1 ? 's' : ''} in inbox ready to run.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Session */}
            <div className="border border-border rounded">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="text-[10px] uppercase tracking-[0.18em] text-text-tertiary font-medium">Session</div>
                {latestSession && (
                  <span className="text-xs text-text-secondary">
                    {latestSession.launchMode} ·{' '}
                    <span
                      className={clsx(
                        'font-medium',
                        latestSession.status === 'running' ? 'text-status-done' : 'text-text-primary',
                      )}
                    >
                      {latestSession.status}
                    </span>
                  </span>
                )}
              </div>

              <div className="min-h-[120px] max-h-60 overflow-y-auto p-4 space-y-2">
                {latestEvents.length > 0 ? (
                  latestEvents.slice(-12).map(event => (
                    <div
                      key={event.id}
                      className={clsx(
                        'rounded px-3 py-2 text-xs',
                        event.type === 'user.message'
                          ? 'bg-brand/5 border border-brand/20'
                          : 'bg-surface-secondary border border-border',
                      )}
                    >
                      <div className="text-[10px] uppercase tracking-[0.14em] text-text-tertiary mb-1">
                        {event.type} · {new Date(event.timestamp).toLocaleTimeString()}
                      </div>
                      <div className="whitespace-pre-wrap break-words text-text-primary">
                        {event.text ?? (event.code == null ? 'No details' : `Exit code ${event.code}`)}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-text-tertiary">
                    {latestSession ? 'No events loaded yet.' : 'No session started.'}
                  </p>
                )}
              </div>

              <div className="border-t border-border p-4 space-y-3">
                {canChat && (
                  <div className="flex gap-2">
                    <Input
                      value={messageDrafts[selectedAgent.id] ?? ''}
                      onChange={e => setMessageDrafts(c => ({ ...c, [selectedAgent.id]: e.target.value }))}
                      placeholder="Send a follow-up instruction…"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void sendSessionMessage(selectedAgent.id)}
                      disabled={
                        runningAgentId === selectedAgent.id ||
                        !(messageDrafts[selectedAgent.id] ?? '').trim()
                      }
                    >
                      Send
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {canRun && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleRunNow(selectedAgent.id)}
                      disabled={runningAgentId === selectedAgent.id}
                    >
                      <Play className="h-3.5 w-3.5" /> Run
                    </Button>
                  )}
                  {canResume && !canRun && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void resumeLatestSession(selectedAgent.id)}
                      disabled={runningAgentId === selectedAgent.id}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Resume
                    </Button>
                  )}
                  {canStop && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void stopLatestSession(selectedAgent.id)}
                      disabled={runningAgentId === selectedAgent.id}
                    >
                      <Square className="h-3.5 w-3.5" /> Stop
                    </Button>
                  )}
                  {!canRun && !canResume && !canStop && !canChat && (
                    <p className="text-xs text-text-tertiary self-center">
                      {inboxCount === 0
                        ? 'Assign a task from the board to run this agent.'
                        : 'Idle — ready to run.'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Capabilities */}
            {((selectedAgent.capabilities?.length ?? 0) > 0 ||
              (selectedAgent.approvalRequiredFor?.length ?? 0) > 0) && (
              <div className="border border-border rounded p-4 space-y-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-text-tertiary font-medium">
                  Capabilities
                </div>
                {(selectedAgent.capabilities?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAgent.capabilities!.map(cap => (
                      <span
                        key={cap}
                        className="rounded border border-border px-2 py-0.5 text-[11px] text-text-secondary"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                )}
                {(selectedAgent.approvalRequiredFor?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-xs text-text-tertiary mb-1.5">Requires approval for:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedAgent.approvalRequiredFor!.map(item => (
                        <span
                          key={item}
                          className="rounded border border-status-waiting/40 bg-status-waiting/5 px-2 py-0.5 text-[11px] text-status-waiting"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {editingAgentRecord && (
        <AgentSetupWizard
          open
          mode="edit"
          initialAgent={editingAgentRecord}
          onClose={() => setEditingAgentId(null)}
        />
      )}
      <AgentSetupWizard open={isNewAgentOpen} onClose={() => setIsNewAgentOpen(false)} />
    </div>
  )
}
