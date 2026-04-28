import { MessageSquare, Pencil, Square, X } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'

import { relayhqApi, type AgentRuntimeReadinessResponse, type AgentSessionEventRecord, type AgentSessionRecord, type AgentStateResponse } from '../api/client'
import { useAppStore } from '../store/appStore'
import { Button } from '../components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogOverlay, DialogPanel, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { useNavigate } from 'react-router-dom'
import { AgentSetupWizard } from '../components/layout/AgentSetupWizard'
import { RuntimeTruthBadges, RuntimeTruthMessage } from '../components/agent/RuntimeTruth'

const SPRITE_OPTIONS = [
  '/assets/sprites/girl_cyber_demon_dual_scythe_1.png',
  '/assets/sprites/girl_cyber_demon_scythe_1.png',
  '/assets/sprites/girl_cyber_demon_scythe_2.png',
  '/assets/sprites/girl_cyber_demon_scythe_3.png',
  '/assets/sprites/girl_cyber_demon_scythe_4.png',
  '/assets/sprites/girl_cyber_demon_scythe_5.png',
  '/assets/sprites/girl_cyber_demon_scythe_6.png',
  '/assets/sprites/girl_cyber_demon_scythe_7.png',
  '/assets/sprites/girl_cyber_demon_scythe_8.png',
  '/assets/sprites/girl_cyber_demon_scythe_9.png',
] as const

const PORTRAIT_OPTIONS = [
  '/assets/portraits/adventurer_silver_girl_1.png',
  '/assets/portraits/angel_blonde_girl_1.png',
  '/assets/portraits/bunny_blue_girl_1.png',
  '/assets/portraits/bunny_blue_girl_2.png',
  '/assets/portraits/bunny_white_girl_1.png',
  '/assets/portraits/bunny_white_girl_2.png',
  '/assets/portraits/bunny_white_girl_3.png',
  '/assets/portraits/bunny_white_girl_4.png',
  '/assets/portraits/bunny_white_girl_5.png',
  '/assets/portraits/bunny_white_girl_6.png',
] as const

const RUNTIME_OPTIONS = [
  { id: 'opencode', label: 'OpenCode' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
] as const

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
  const [runMode, setRunMode] = useState<'manual' | 'subprocess' | 'webhook'>('manual')
  const [runCommand, setRunCommand] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [aliases, setAliases] = useState('')
  const [capabilities, setCapabilities] = useState('')
  const [approvalRequiredFor, setApprovalRequiredFor] = useState('')
  const [spriteAsset, setSpriteAsset] = useState('')
  const [portraitAsset, setPortraitAsset] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null)
  const [selectedInboxAgentId, setSelectedInboxAgentId] = useState<string | null>(null)
  const [selectedChatAgentId, setSelectedChatAgentId] = useState<string | null>(null)
  const [inboxLoadingAgentId, setInboxLoadingAgentId] = useState<string | null>(null)
  const [agentStates, setAgentStates] = useState<Record<string, AgentStateResponse>>({})
  const [runtimeReadiness, setRuntimeReadiness] = useState<Record<string, AgentRuntimeReadinessResponse>>({})
  const [sessionsByAgent, setSessionsByAgent] = useState<Record<string, ReadonlyArray<AgentSessionRecord>>>({})
  const [eventsBySession, setEventsBySession] = useState<Record<string, ReadonlyArray<AgentSessionEventRecord>>>({})
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({})
  const [runtimeSelectionByAgent, setRuntimeSelectionByAgent] = useState<Record<string, string>>({})
  const [runtimeLoadingAgentId, setRuntimeLoadingAgentId] = useState<string | null>(null)
  const [isNewAgentOpen, setIsNewAgentOpen] = useState(false)
  const [runNowNotice, setRunNowNotice] = useState<string | null>(null)
  const [wizardError, setWizardError] = useState<string | null>(null)
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentRole, setNewAgentRole] = useState('implementation')
  const [newAgentProvider, setNewAgentProvider] = useState('claude')
  const [newAgentModel, setNewAgentModel] = useState('claude-sonnet-4-6')
  const [newAgentRunMode, setNewAgentRunMode] = useState<'manual' | 'subprocess' | 'webhook'>('manual')
  const [newAgentRunCommand, setNewAgentRunCommand] = useState('')
  const [newAgentWebhookUrl, setNewAgentWebhookUrl] = useState('')
  const [newAgentAliases, setNewAgentAliases] = useState('')
  const [newAgentCapabilities, setNewAgentCapabilities] = useState('write-code\nrun-tests')
  const [newAgentApprovalRequiredFor, setNewAgentApprovalRequiredFor] = useState('')
  const [newAgentAccountId, setNewAgentAccountId] = useState('')
  const [newAgentApiKeyRef, setNewAgentApiKeyRef] = useState('')

  const editingAgent = agents.find(agent => agent.id === editingAgentId) ?? null

  function getInboxCount(agentId: string) {
    return agentStates[agentId]?.inbox.length ?? tasks.filter(task => task.assigneeId === agentId && task.status === 'todo').length
  }

  function getCurrentTask(agentId: string) {
    return tasks.find(task => task.assigneeId === agentId && task.status !== 'done' && task.status !== 'cancelled') ?? null
  }

  async function loadInbox(agentId: string) {
    setInboxLoadingAgentId(agentId)
    try {
      const state = await relayhqApi.getAgentState(agentId)
      setAgentStates(current => ({ ...current, [agentId]: state }))
      setSelectedInboxAgentId(agentId)
    } finally {
      setInboxLoadingAgentId(null)
    }
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

  async function sendSessionMessage(agentId: string) {
    const sessions = sessionsByAgent[agentId] ?? await loadSessions(agentId)
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

  async function ensureChatSession(agentId: string) {
    setRunNowNotice(null)
    const [state, readiness, existingSessions] = await Promise.all([
      agentStates[agentId] ? Promise.resolve(agentStates[agentId]) : relayhqApi.getAgentState(agentId),
      verifyRuntime(agentId),
      loadSessions(agentId),
    ])

    setAgentStates(current => ({ ...current, [agentId]: state }))

    if (existingSessions[0]?.launchSurface === 'background' && existingSessions[0]?.status === 'running') {
      await loadSessionEvents(existingSessions[0].sessionId)
      return existingSessions[0]
    }

    if (readiness.verificationStatus !== 'ready') {
      setRunNowNotice(`Agent ${agentId} is not runtime-ready yet. Verify or bind its runtime first.`)
      return null
    }

    const nextTask = state.active ?? state.inbox[0] ?? null
    if (!nextTask) {
      setRunNowNotice(`Agent ${agentId} does not have an active or queued task to chat about. Assign a task first.`)
      return null
    }

    setRunningAgentId(agentId)
    try {
      if (existingSessions[0]) {
        await relayhqApi.resumeAgent(agentId, {
          taskId: nextTask.id,
          previousSessionId: existingSessions[0].sessionId,
          surface: 'background',
        })
      } else {
        await relayhqApi.runAgent(agentId, { taskId: nextTask.id, surface: 'background' })
      }

      await loadData()
      await loadInbox(agentId)
      const resumedSessions = await loadSessions(agentId)
      if (resumedSessions[0]) {
        await loadSessionEvents(resumedSessions[0].sessionId)
        return resumedSessions[0]
      }
      return null
    } finally {
      setRunningAgentId(null)
    }
  }

  async function openChat(agentId: string) {
    setSelectedChatAgentId(agentId)
    await ensureChatSession(agentId)
  }

  useEffect(() => {
    if (!selectedChatAgentId) return

    const intervalId = window.setInterval(() => {
      void (async () => {
        const sessions = await loadSessions(selectedChatAgentId)
        if (sessions[0]) {
          await loadSessionEvents(sessions[0].sessionId)
        }
      })()
    }, 2000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [selectedChatAgentId])

  async function verifyRuntime(agentId: string) {
    setRuntimeLoadingAgentId(agentId)
    try {
      const readiness = await relayhqApi.getAgentRuntimeReadiness(agentId)
      setRuntimeReadiness(current => ({ ...current, [agentId]: readiness }))
      return readiness
    } finally {
      setRuntimeLoadingAgentId(current => current === agentId ? null : current)
    }
  }

  function selectedRuntime(agentId: string, fallbackProvider?: string | null) {
    return runtimeSelectionByAgent[agentId] ?? (fallbackProvider === 'claude' ? 'claude-code' : fallbackProvider === 'codex' ? 'codex' : 'opencode')
  }

  async function bindRuntime(agentId: string, runtime: string) {
    setRuntimeLoadingAgentId(agentId)
    try {
      await relayhqApi.bindAgentRuntime(agentId, runtime)
      await loadData()
      await verifyRuntime(agentId)
    } finally {
      setRuntimeLoadingAgentId(current => current === agentId ? null : current)
    }
  }

  async function handleRunNow(agentId: string) {
    const state = agentStates[agentId] ?? await relayhqApi.getAgentState(agentId)
    setAgentStates(current => ({ ...current, [agentId]: state }))
    const nextTask = state.inbox[0] ?? state.active
    if (!nextTask) {
      setRunNowNotice(`Agent ${agentId} does not have an active or queued task to run. Assign a task first.`)
      return
    }

    if (state.inbox.length > 1) {
      setSelectedInboxAgentId(agentId)
      return
    }

    setRunningAgentId(agentId)
    try {
      await relayhqApi.runAgent(agentId, { taskId: nextTask.id, surface: 'background' })
      await loadData()
      await loadInbox(agentId)
      const sessions = await loadSessions(agentId)
      if (sessions[0]) {
        await loadSessionEvents(sessions[0].sessionId)
      }
    } finally {
      setRunningAgentId(null)
    }
  }

  async function saveNewAgent() {
    setIsSaving(true)
    try {
      await relayhqApi.createAgent({
        name: newAgentName,
        role: newAgentRole,
        provider: newAgentProvider,
        model: newAgentModel,
        accountId: newAgentAccountId.trim().length > 0 ? newAgentAccountId.trim() : null,
        apiKeyRef: newAgentApiKeyRef.trim().length > 0 ? newAgentApiKeyRef.trim() : null,
        runMode: newAgentRunMode,
        runCommand: newAgentRunCommand.trim().length > 0 ? newAgentRunCommand.trim() : null,
        webhookUrl: newAgentWebhookUrl.trim().length > 0 ? newAgentWebhookUrl.trim() : null,
        aliases: newAgentAliases.split(/\r?\n|,/).map(line => line.trim()).filter(Boolean),
        capabilities: newAgentCapabilities.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
        approvalRequiredFor: newAgentApprovalRequiredFor.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
      })
      await loadData()
      setIsNewAgentOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  function startCreateAgent() {
    setIsNewAgentOpen(true)
    setNewAgentName('')
    setNewAgentRole('implementation')
    setNewAgentProvider('claude')
    setNewAgentModel('claude-sonnet-4-6')
    setNewAgentRunMode('manual')
    setNewAgentRunCommand('')
    setNewAgentWebhookUrl('')
    setNewAgentAliases('')
    setNewAgentCapabilities('write-code\nrun-tests')
    setNewAgentApprovalRequiredFor('')
    setNewAgentAccountId('')
    setNewAgentApiKeyRef('')
  }

  function startEdit(agentId: string) {
    const agent = agents.find(entry => entry.id === agentId)
    if (!agent) return
    setEditingAgentId(agentId)
    setAgentName(agent.name)
    setAccountId(agent.accountId ?? '')
    setApiKeyRef(agent.apiKeyRef ?? '')
    setMonthlyBudgetUsd(agent.monthlyBudgetUsd != null ? String(agent.monthlyBudgetUsd) : '')
    setRunMode((agent.runMode as 'manual' | 'subprocess' | 'webhook' | null) ?? 'manual')
    setRunCommand(agent.runCommand ?? '')
    setWebhookUrl(agent.webhookUrl ?? '')
    setAliases((agent.aliases ?? []).join('\n'))
    setCapabilities((agent.capabilities ?? []).join('\n'))
    setApprovalRequiredFor((agent.approvalRequiredFor ?? []).join('\n'))
    setSpriteAsset(agent.spriteAsset ?? '')
    setPortraitAsset(agent.portraitAsset ?? '')
  }

  async function runInboxTask(agentId: string) {
    const task = tasks.find(entry => entry.assigneeId === agentId && entry.status === 'todo')
    if (!task) return

    setRunningAgentId(agentId)
    try {
      await relayhqApi.runAgent(agentId, { taskId: task.id, surface: 'background' })
      await loadData()
      const sessions = await loadSessions(agentId)
      if (sessions[0]) {
        await loadSessionEvents(sessions[0].sessionId)
      }
    } finally {
      setRunningAgentId(null)
    }
  }

  async function resumeLatestSession(agentId: string) {
    const state = agentStates[agentId] ?? await relayhqApi.getAgentState(agentId)
    setAgentStates(current => ({ ...current, [agentId]: state }))
    const sessions = sessionsByAgent[agentId] ?? await loadSessions(agentId)
    const previousSession = sessions.find(session => session.status === 'running' || session.status === 'failed' || session.status === 'completed') ?? null
    const taskId = state.active?.id ?? state.inbox[0]?.id
    if (!taskId) return

    setRunningAgentId(agentId)
    try {
      await relayhqApi.resumeAgent(agentId, { taskId, previousSessionId: previousSession?.sessionId ?? null, surface: 'background' })
      await loadData()
      await loadInbox(agentId)
      const sessions = await loadSessions(agentId)
      if (sessions[0]) {
        await loadSessionEvents(sessions[0].sessionId)
      }
    } finally {
      setRunningAgentId(null)
    }
  }

  async function stopLatestSession(agentId: string) {
    const sessions = sessionsByAgent[agentId] ?? await loadSessions(agentId)
    const runningSession = sessions.find(session => session.status === 'running')
    if (!runningSession) return
    setRunningAgentId(agentId)
    try {
      await relayhqApi.stopAgentSession(runningSession.sessionId)
      await loadSessions(agentId)
      await loadData()
    } finally {
      setRunningAgentId(null)
    }
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
            portrait_asset: portraitAsset || undefined,
            sprite_asset: spriteAsset || undefined,
            monthly_budget_usd: monthlyBudgetUsd.trim().length > 0 ? Number(monthlyBudgetUsd) : undefined,
            run_command: runCommand.trim().length > 0 ? runCommand.trim() : undefined,
            run_mode: runMode,
            webhook_url: webhookUrl.trim().length > 0 ? webhookUrl.trim() : undefined,
            aliases: aliases.split(/\r?\n|,/).map(line => line.trim()).filter(Boolean),
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

  async function deleteAgent() {
    if (!editingAgentId) return
    if (!window.confirm(`Delete agent ${editingAgent?.name ?? editingAgentId}?`)) return

    setIsSaving(true)
    try {
      await relayhqApi.deleteAgent(editingAgentId)
      await loadData()
      setEditingAgentId(null)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex min-h-full w-full flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-text-primary">Agents</h1>
          <p className="text-sm text-text-secondary">
            {activeAgents.length} active / {agents.length} total
          </p>
          {runNowNotice && (
            <p className="text-sm text-status-waiting">{runNowNotice}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={startCreateAgent}>
            New Agent
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {agents.map(agent => {
            const task = getCurrentTask(agent.id)
            const inboxCount = getInboxCount(agent.id)
            const runModeLabel = agent.runMode ?? 'manual'
            const readiness = runtimeReadiness[agent.id]
            const sessions = sessionsByAgent[agent.id] ?? []
            const latestSession = sessions[0] ?? null
            const latestEvents = latestSession ? (eventsBySession[latestSession.sessionId] ?? []) : []
            const canChatInApp = latestSession?.launchSurface === 'background' && latestSession.status === 'running'
            const hasRunnableTask = inboxCount > 0 || task?.status === 'todo' || task?.status === 'in-progress'
            const chatPlaceholder = !latestSession
              ? (hasRunnableTask ? 'Open Chat will start or resume a background session for this task' : 'Assign a task to this agent before starting chat')
              : latestSession.launchSurface !== 'background'
                ? 'This session was launched outside the in-app chat surface'
                : latestSession.status !== 'running'
                  ? 'Resume the latest background session to continue chatting'
                  : 'Send a message to the running session'

            return (
              <div key={agent.id} className="border border-border bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className={clsx('absolute inset-0 rounded-full opacity-60', agent.state === 'active' ? 'animate-pulse-agent bg-status-done' : agent.state === 'waiting' ? 'bg-status-waiting' : agent.state === 'stale' ? 'bg-status-blocked' : 'bg-text-tertiary')} />
                      <span className={clsx('relative h-3 w-3 rounded-full', agent.state === 'active' ? 'bg-status-done' : agent.state === 'waiting' ? 'bg-status-waiting' : agent.state === 'stale' ? 'bg-status-blocked' : 'bg-text-tertiary')} />
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{agent.name}</div>
                      <div className="text-xs text-text-tertiary">{agent.provider || 'unknown'} · {runModeLabel}</div>
                    </div>
                  </div>
                  <span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-text-tertiary">Inbox {inboxCount}</span>
                </div>

                {task ? (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Current task</div>
                    <div className="text-sm font-medium text-text-primary">{task.title}</div>
                    {task.dispatchStatus && (
                      <div className="text-xs text-text-secondary">Dispatch: <span className="font-medium text-text-primary">{task.dispatchStatus}</span></div>
                    )}
                    {task.dispatchReason && (
                      <div className="text-xs text-text-tertiary">{task.dispatchReason}</div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-text-secondary">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                        <div className="h-full bg-status-active" style={{ width: `${task.progress}%` }} />
                      </div>
                      <span>{task.progress}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-text-tertiary">No current task.</div>
                )}

                <div className="mt-4 rounded-xl border border-border bg-surface-secondary p-3 text-xs text-text-secondary">
                  <div className="flex items-center justify-between gap-3">
                    <span>Runtime</span>
                    <span className="font-medium text-text-primary">{readiness?.runtimeKind ?? agent.runtimeKind ?? runModeLabel}</span>
                  </div>
                  <RuntimeTruthBadges agent={agent} readiness={readiness} className="mt-3" />
                  <RuntimeTruthMessage agent={agent} readiness={readiness} className="mt-3" />
                  {readiness?.reason && <div className="mt-2 text-status-blocked">{readiness.reason}</div>}
                  {latestSession && (
                    <>
                      <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2">
                        <span>Last session</span>
                        <span className="font-medium text-text-primary">{latestSession.launchMode} · {latestSession.status}</span>
                      </div>
                      <div className="mt-2 max-h-28 overflow-y-auto rounded-none border border-border bg-surface px-2 py-2 text-[11px] text-text-secondary">
                        {latestEvents.length > 0 ? latestEvents.slice(-4).map((event) => (
                          <div key={event.id} className="mb-2 last:mb-0">
                            <div className="uppercase tracking-[0.14em] text-text-tertiary">{event.type}</div>
                            <div className="whitespace-pre-wrap break-words text-text-primary">{event.text ?? (event.code == null ? 'No details' : `Exit code ${event.code}`)}</div>
                          </div>
                        )) : 'No session events loaded.'}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Input
                          value={messageDrafts[agent.id] ?? ''}
                          onChange={(event) => setMessageDrafts(current => ({ ...current, [agent.id]: event.target.value }))}
                          placeholder={chatPlaceholder}
                          disabled={!canChatInApp}
                        />
                        <Button type="button" size="sm" onClick={() => void sendSessionMessage(agent.id)} disabled={!canChatInApp || runningAgentId === agent.id || !(messageDrafts[agent.id] ?? '').trim()}>
                          Send
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => void openChat(agent.id)}>
                    <MessageSquare className="h-3.5 w-3.5" /> Chat
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => startEdit(agent.id)}>
                    Edit Config
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void stopLatestSession(agent.id)} disabled={runningAgentId === agent.id || !latestSession}>
                    <Square className="h-3.5 w-3.5" /> Stop
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

      </div>

      {editingAgent && (
        <Dialog open>
          <DialogOverlay onClick={() => setEditingAgentId(null)} />
          <DialogContent>
            <DialogPanel className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Edit agent</DialogTitle>
                <Button variant="ghost" size="icon" onClick={() => setEditingAgentId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogHeader>
              <DialogBody>
                <div className="flex flex-col gap-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Sprite</div>
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1.5 border border-border bg-surface-secondary p-2 lcd-card">
                          {spriteAsset ? (
                            <img src={spriteAsset} alt="Selected sprite" className="h-24 w-24 object-contain" style={{ imageRendering: 'pixelated' }} />
                          ) : (
                            <div className="flex h-24 w-24 items-center justify-center text-[10px] text-text-tertiary">No sprite</div>
                          )}
                        </div>
                        <div className="grid flex-1 grid-cols-5 gap-2">
                          {SPRITE_OPTIONS.map(option => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setSpriteAsset(option)}
                              className={`border p-1 transition-transform lcd-card ${spriteAsset === option ? 'border-brand bg-brand-muted scale-[1.03]' : 'border-border bg-surface hover:border-brand/40'}`}
                            >
                              <img src={option} alt="Sprite option" className="h-12 w-full object-contain" style={{ imageRendering: 'pixelated' }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Portrait</div>
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center gap-1.5 border border-border bg-surface-secondary p-2 lcd-card">
                          {portraitAsset ? (
                            <img src={portraitAsset} alt="Selected portrait" className="h-14 w-14 object-cover" style={{ imageRendering: 'pixelated' }} />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center text-[10px] text-text-tertiary">No portrait</div>
                          )}
                        </div>
                        <div className="grid flex-1 grid-cols-5 gap-2">
                          {PORTRAIT_OPTIONS.map(option => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setPortraitAsset(option)}
                              className={`border p-1 transition-transform lcd-card ${portraitAsset === option ? 'border-brand bg-brand-muted scale-[1.03]' : 'border-border bg-surface hover:border-brand/40'}`}
                            >
                              <img src={option} alt="Portrait option" className="h-12 w-full object-cover" style={{ imageRendering: 'pixelated' }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

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
                  <div className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Run mode
                    <div className="flex gap-2 rounded-xl border border-border bg-surface-secondary p-1">
                      {(['manual', 'subprocess', 'webhook'] as const).map(mode => (
                        <button key={mode} type="button" onClick={() => setRunMode(mode)} className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${runMode === mode ? 'bg-surface text-accent shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}>
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Run command
                    <Input value={runCommand} onChange={event => setRunCommand(event.target.value)} placeholder="bun run ./cli/relayhq.ts run --taskId={taskId}" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Webhook URL
                    <Input value={webhookUrl} onChange={event => setWebhookUrl(event.target.value)} placeholder="https://example.com/webhook" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Aliases
                    <Textarea value={aliases} onChange={event => setAliases(event.target.value)} rows={2} placeholder="claude-operator, coder" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Capabilities
                    <Textarea value={capabilities} onChange={event => setCapabilities(event.target.value)} rows={4} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Approval required for
                    <Textarea value={approvalRequiredFor} onChange={event => setApprovalRequiredFor(event.target.value)} rows={3} />
                  </label>
                  <div className="flex flex-wrap justify-between gap-2 pt-2">
                    <Button type="button" variant="danger" onClick={() => void deleteAgent()} disabled={isSaving}>
                      Delete
                    </Button>
                    <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditingAgentId(null)}>Cancel</Button>
                    <Button type="button" onClick={() => void saveAgent()} disabled={isSaving}>{isSaving ? 'Saving...' : 'Save'}</Button>
                    </div>
                  </div>
                  </div>
                </div>
              </DialogBody>
            </DialogPanel>
          </DialogContent>
        </Dialog>
      )}

      {selectedChatAgentId && (() => {
        const agent = agents.find(entry => entry.id === selectedChatAgentId) ?? null
        const sessions = sessionsByAgent[selectedChatAgentId] ?? []
        const latestSession = sessions[0] ?? null
        const events = latestSession ? (eventsBySession[latestSession.sessionId] ?? []) : []
        const readiness = runtimeReadiness[selectedChatAgentId] ?? null
        const draft = messageDrafts[selectedChatAgentId] ?? ''
        const currentTask = getCurrentTask(selectedChatAgentId)
        const hasRunnableTask = (agentStates[selectedChatAgentId]?.inbox.length ?? 0) > 0 || currentTask?.status === 'todo' || currentTask?.status === 'in-progress'
        const chatPlaceholder = !latestSession
          ? (hasRunnableTask ? 'No session yet. Chat will start one for the current task.' : 'No task is assigned to this agent yet.')
          : latestSession.launchSurface !== 'background'
            ? 'This session is detached from the in-app chat surface.'
            : latestSession.status !== 'running'
              ? 'Resume the latest session to continue chatting.'
              : 'Send a follow-up instruction to the agent session'

        return (
          <Dialog open>
            <DialogOverlay onClick={() => setSelectedChatAgentId(null)} />
            <DialogContent>
              <DialogPanel className="max-w-4xl">
                <DialogHeader>
                  <DialogTitle>{agent?.name ?? selectedChatAgentId} · Agent Chat</DialogTitle>
                  <Button variant="ghost" size="icon" onClick={() => setSelectedChatAgentId(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </DialogHeader>
                <DialogBody>
                  <div className="grid gap-4 lg:min-h-[540px] lg:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="space-y-3">
                      <div className="rounded-xl border border-border bg-surface-secondary p-4 text-sm text-text-secondary">
                        <div className="font-medium text-text-primary">{agent?.name ?? selectedChatAgentId}</div>
                        {agent ? <RuntimeTruthBadges agent={agent} readiness={readiness} className="mt-3" /> : null}
                        {agent ? <RuntimeTruthMessage agent={agent} readiness={readiness} className="mt-3" /> : null}
                        {readiness?.reason && <div className="mt-2 text-status-blocked">{readiness.reason}</div>}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => void stopLatestSession(selectedChatAgentId)} disabled={runningAgentId === selectedChatAgentId || !latestSession}>Stop</Button>
                      </div>

                      <div className="rounded-xl border border-border bg-surface-secondary p-4 text-sm text-text-secondary">
                        <div className="font-medium text-text-primary">Latest session</div>
                        {latestSession ? (
                          <div className="mt-2 space-y-1">
                            <div>Status: {latestSession.status}</div>
                            <div>Surface: {latestSession.launchSurface}</div>
                            <div>Launch: {latestSession.launchMode}</div>
                            <div>Started: {new Date(latestSession.startTime).toLocaleString()}</div>
                            {latestSession.launchSurface === 'visible-terminal' && <div className="text-status-waiting">This session is running in a detached terminal window. Follow-up messages are not available in the web chat surface.</div>}
                          </div>
                        ) : <div className="mt-2 text-text-tertiary">No session yet.</div>}
                      </div>
                    </div>

                    <div className="flex min-h-[480px] min-w-0 flex-col rounded-xl border border-border bg-surface-secondary">
                      <div className="border-b border-border px-4 py-3 text-sm font-medium text-text-primary">Transcript</div>
                      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                        {events.length > 0 ? events.map((event) => (
                          <div key={event.id} className={clsx('rounded-lg border px-3 py-2 text-sm', event.type === 'user.message' ? 'border-brand/40 bg-brand-muted text-text-primary' : 'border-border bg-surface text-text-primary')}>
                            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-text-tertiary">{event.type} · {new Date(event.timestamp).toLocaleTimeString()}</div>
                            <div className="whitespace-pre-wrap break-words">{event.text ?? (event.code == null ? 'No details' : `Exit code ${event.code}`)}</div>
                          </div>
                        )) : <div className="text-sm text-text-tertiary">No transcript events yet.</div>}
                      </div>
                      <div className="border-t border-border p-4">
                        <div className="flex gap-2">
                        <Input value={draft} onChange={(event) => setMessageDrafts(current => ({ ...current, [selectedChatAgentId]: event.target.value }))} placeholder={chatPlaceholder} disabled={!(latestSession?.launchSurface === 'background' && latestSession?.status === 'running')} />
                        <Button type="button" onClick={() => void sendSessionMessage(selectedChatAgentId)} disabled={runningAgentId === selectedChatAgentId || draft.trim().length === 0 || !(latestSession?.launchSurface === 'background' && latestSession?.status === 'running')}>Send</Button>
                      </div>
                      </div>
                    </div>
                  </div>
                </DialogBody>
              </DialogPanel>
            </DialogContent>
          </Dialog>
        )
      })()}

      <AgentSetupWizard open={isNewAgentOpen} onClose={() => setIsNewAgentOpen(false)} />

      {false && isNewAgentOpen && (
        <Dialog open>
          <DialogOverlay onClick={() => setIsNewAgentOpen(false)} />
          <DialogContent>
            <DialogPanel className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>New agent</DialogTitle>
                <Button variant="ghost" size="icon" onClick={() => setIsNewAgentOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogHeader>

              <DialogBody>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Name
                    <Input value={newAgentName} onChange={event => setNewAgentName(event.target.value)} placeholder="Claude Operator" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Role
                    <Input value={newAgentRole} onChange={event => setNewAgentRole(event.target.value)} placeholder="implementation" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Provider
                    <Input value={newAgentProvider} onChange={event => setNewAgentProvider(event.target.value)} placeholder="claude" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Model
                    <Input value={newAgentModel} onChange={event => setNewAgentModel(event.target.value)} placeholder="claude-sonnet-4-6" />
                  </label>
                  <div className="flex flex-col gap-1.5 text-sm text-text-secondary md:col-span-2">
                    Run mode
                    <div className="flex gap-2 rounded-xl border border-border bg-surface-secondary p-1">
                      {(['manual', 'subprocess', 'webhook'] as const).map(mode => (
                        <button key={mode} type="button" onClick={() => setNewAgentRunMode(mode)} className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${newAgentRunMode === mode ? 'bg-surface text-accent shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}>
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary md:col-span-2">
                    Run command
                    <Input value={newAgentRunCommand} onChange={event => setNewAgentRunCommand(event.target.value)} placeholder="bun run ./cli/relayhq.ts run --taskId={taskId}" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary md:col-span-2">
                    Webhook URL
                    <Input value={newAgentWebhookUrl} onChange={event => setNewAgentWebhookUrl(event.target.value)} placeholder="https://example.com/webhook" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary md:col-span-2">
                    Aliases
                    <Textarea value={newAgentAliases} onChange={event => setNewAgentAliases(event.target.value)} rows={2} placeholder="operator, coder" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary md:col-span-2">
                    Capabilities
                    <Textarea value={newAgentCapabilities} onChange={event => setNewAgentCapabilities(event.target.value)} rows={3} placeholder="write-code\nrun-tests" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary md:col-span-2">
                    Approval required for
                    <Textarea value={newAgentApprovalRequiredFor} onChange={event => setNewAgentApprovalRequiredFor(event.target.value)} rows={2} placeholder="deploy" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    Account id
                    <Input value={newAgentAccountId} onChange={event => setNewAgentAccountId(event.target.value)} placeholder="codex-account-1" />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    API key ref
                    <Input value={newAgentApiKeyRef} onChange={event => setNewAgentApiKeyRef(event.target.value)} placeholder="env:ANTHROPIC_API_KEY" />
                  </label>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsNewAgentOpen(false)}>Cancel</Button>
                  <Button type="button" onClick={() => void saveNewAgent()} disabled={isSaving || newAgentName.trim().length === 0}>
                    {isSaving ? 'Saving...' : 'Create'}
                  </Button>
                </div>
              </DialogBody>
            </DialogPanel>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
