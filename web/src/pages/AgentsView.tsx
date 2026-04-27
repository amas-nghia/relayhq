import { Pencil, X } from 'lucide-react'
import clsx from 'clsx'
import { useEffect, useState } from 'react'

import { relayhqApi, type AgentStateResponse } from '../api/client'
import { useAppStore } from '../store/appStore'
import { Button } from '../components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogOverlay, DialogPanel, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { useNavigate } from 'react-router-dom'
import { AgentSetupWizard } from '../components/layout/AgentSetupWizard'

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
  const [inboxLoadingAgentId, setInboxLoadingAgentId] = useState<string | null>(null)
  const [agentStates, setAgentStates] = useState<Record<string, AgentStateResponse>>({})
  const [isNewAgentOpen, setIsNewAgentOpen] = useState(false)
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

  async function handleRunNow(agentId: string) {
    const state = agentStates[agentId] ?? await relayhqApi.getAgentState(agentId)
    setAgentStates(current => ({ ...current, [agentId]: state }))
    const nextTask = state.inbox[0] ?? state.active
    if (!nextTask) {
      setSelectedInboxAgentId(agentId)
      return
    }

    if (state.inbox.length > 1) {
      setSelectedInboxAgentId(agentId)
      return
    }

    setRunningAgentId(agentId)
    try {
      await relayhqApi.runAgent(agentId, { taskId: nextTask.id })
      await loadData()
      await loadInbox(agentId)
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
      await relayhqApi.runAgent(agentId, { taskId: task.id })
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

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void loadInbox(agent.id)} disabled={inboxLoadingAgentId === agent.id}>
                    View Inbox
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => startEdit(agent.id)}>
                    Edit Config
                  </Button>
                  <Button type="button" size="sm" onClick={() => void handleRunNow(agent.id)} disabled={runningAgentId === agent.id}>
                    {runningAgentId === agent.id ? 'Running…' : 'Run Now'}
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

      {selectedInboxAgentId && (
        <Dialog open>
          <DialogOverlay onClick={() => setSelectedInboxAgentId(null)} />
          <DialogContent>
            <DialogPanel className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Agent Inbox</DialogTitle>
                <Button variant="ghost" size="icon" onClick={() => setSelectedInboxAgentId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogHeader>

              {(() => {
                const state = agentStates[selectedInboxAgentId]
                if (!state) {
                  return <div className="p-4 text-sm text-text-secondary">No inbox data loaded yet.</div>
                }

                return (
                  <div className="flex flex-col gap-4 p-1">
                    <div className="rounded-xl border border-border bg-surface-secondary p-4 text-sm text-text-secondary">
                      <div className="font-medium text-text-primary">{state.agentId}</div>
                      <div>Active: {state.active ? state.active.title : 'none'}</div>
                      <div>Inbox: {state.inbox.length} task(s)</div>
                    </div>

                    <div className="space-y-3">
                      {state.inbox.map(task => (
                        <div key={task.id} className="rounded-xl border border-border bg-surface-secondary p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-text-primary">{task.title}</div>
                              <div className="text-xs text-text-tertiary">{task.status} · {task.priority}</div>
                            </div>
                            <Button type="button" size="sm" onClick={async () => {
                              setRunningAgentId(state.agentId)
                              try {
                                await relayhqApi.runAgent(state.agentId, { taskId: task.id })
                                await loadData()
                                await loadInbox(state.agentId)
                              } finally {
                                setRunningAgentId(null)
                              }
                            }} disabled={runningAgentId === state.agentId}>
                              {runningAgentId === state.agentId ? 'Running…' : '▶ Run'}
                            </Button>
                          </div>
                        </div>
                      ))}

                      {state.inbox.length === 0 && <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-tertiary">No inbox tasks.</div>}
                    </div>
                  </div>
                )
              })()}
            </DialogPanel>
          </DialogContent>
        </Dialog>
      )}

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
