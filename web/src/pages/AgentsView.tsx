import { Activity, ArrowRight, Circle, Clock3, Coins, Pencil, Play, ScanSearch, X } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';

import { relayhqApi } from '../api/client';
import { useAppStore } from '../store/appStore';
import { Button } from '../components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogOverlay, DialogPanel, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';

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
        const pulseTone = agent.state === 'active' ? 'bg-status-done' : agent.state === 'stale' ? 'bg-status-waiting' : 'bg-status-waiting'

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

export function AgentsView() {
  const agents = useAppStore(state => state.agents);
  const tasks = useAppStore(state => state.tasks);
  const projects = useAppStore(state => state.projects);
  const openDetail = useAppStore(state => state.openTaskDetail);
  const loadData = useAppStore(state => state.loadData);
  const activeAgents = agents.filter(a => a.state !== 'idle');
  const idleAgents = agents.filter(a => a.state === 'idle');
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [agentName, setAgentName] = useState('')
  const [capabilities, setCapabilities] = useState('')
  const [approvalRequiredFor, setApprovalRequiredFor] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [tab, setTab] = useState<'activity' | 'cost'>('activity')
  const [activityByAgent, setActivityByAgent] = useState<Record<string, Array<any>>>({})
  const [costSummary, setCostSummary] = useState<{ total_tokens: number; total_cost_usd: number; model_breakdown: Array<any>; agent_breakdown: Array<any>; context_reuse_savings: number } | null>(null)

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
    if (tab !== 'cost') return
    void relayhqApi.getCostSummary().then(setCostSummary)
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
        <div className="flex gap-2 rounded-xl border border-border bg-surface p-1 w-fit">
          <Button type="button" variant={tab === 'activity' ? 'secondary' : 'ghost'} onClick={() => setTab('activity')}>Activity</Button>
          <Button type="button" variant={tab === 'cost' ? 'secondary' : 'ghost'} onClick={() => setTab('cost')}><Coins className="h-4 w-4" /> Cost & Usage</Button>
        </div>

        {tab === 'cost' && costSummary && (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-surface-secondary p-3"><div className="text-xs text-text-tertiary">Total tokens</div><div className="text-xl font-semibold text-text-primary">{costSummary.total_tokens.toLocaleString()}</div></div>
              <div className="rounded-xl bg-surface-secondary p-3"><div className="text-xs text-text-tertiary">Total cost</div><div className="text-xl font-semibold text-text-primary">${costSummary.total_cost_usd.toFixed(2)}</div></div>
              <div className="rounded-xl bg-surface-secondary p-3"><div className="text-xs text-text-tertiary">Context reuse savings</div><div className="text-xl font-semibold text-text-primary">{Math.round(costSummary.context_reuse_savings).toLocaleString()}</div></div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface-secondary p-4">
                <div className="mb-2 text-sm font-semibold text-text-primary">By model</div>
                <div className="space-y-2 text-sm text-text-secondary">
                  {costSummary.model_breakdown.map(entry => <div key={entry.model} className="flex justify-between gap-3"><span>{entry.model}</span><span>{entry.tokens_used.toLocaleString()} tokens · ${entry.cost_usd.toFixed(2)}</span></div>)}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-surface-secondary p-4">
                <div className="mb-2 text-sm font-semibold text-text-primary">By agent</div>
                <div className="space-y-2 text-sm text-text-secondary">
                  {costSummary.agent_breakdown.map(entry => <div key={entry.agent_id} className="flex justify-between gap-3"><span>{entry.agent_id}</span><span>{entry.tokens_used.toLocaleString()} tokens · ${entry.cost_usd.toFixed(2)}</span></div>)}
                </div>
              </div>
            </div>
          </div>
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
          <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider px-1">
            ACTIVE AGENTS
          </h3>
          <div className="flex flex-col border border-border rounded-lg bg-surface divide-y divide-border overflow-hidden">
            {activeAgents.map(agent => {
              const task = tasks.find(t => t.assigneeId === agent.id && (t.status === 'in-progress' || t.status === 'waiting-approval' || t.status === 'blocked'));
              const project = task ? projects.find(p => p.id === task.projectId) : null;
              
              const isGreen = agent.state === 'active';
              const isYellow = agent.state === 'waiting';
              const isRed = agent.state === 'stale';

              return (
                <div key={agent.id} className="flex cursor-pointer flex-col gap-2 p-4 transition-colors group hover:bg-surface-secondary">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <div className="relative flex">
                        <Circle className={clsx("w-3 h-3 fill-current", isGreen ? "text-status-done" : isYellow ? "text-status-waiting" : isRed ? "text-status-blocked" : "text-text-tertiary")} />
                        {isGreen && (
                          <span className="absolute inset-0 block animate-pulse-agent rounded-full bg-status-done opacity-50 shadow-[0_0_8px_rgba(22,163,74,0.8)]" />
                        )}
                      </div>
                      <span className="font-semibold text-text-primary text-sm">{agent.name}</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => startEdit(agent.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {task && (
                      <span className={clsx(
                        "text-[11px] font-bold uppercase tracking-wider",
                        isYellow && "text-status-waiting",
                        isRed && "text-status-blocked",
                        isGreen && "text-transparent" // hide if active, or show 'in-progress'
                      )}>
                        {task.status.replace('-', ' ')}
                      </span>
                    )}
                  </div>
                  
                  {task && (
                    <div className="flex items-start gap-4">
                      <div className="w-5 shrink-0" />
                      <div className="flex flex-col gap-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
                          {task.title} <span className="text-text-tertiary font-normal">•</span> <span className="text-text-secondary font-normal">{project?.name}</span>
                        </div>
                        
                        {agent.state === 'active' && (
                          <div className="flex items-center gap-3 text-xs text-text-secondary">
                            <div className="w-32 h-1.5 bg-border rounded-full overflow-hidden flex-shrink-0">
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
                            <button onClick={(e) => { e.stopPropagation(); openDetail(task.id); }} className="text-accent hover:text-accent-light font-medium flex items-center gap-1 transition-colors">
                              Review approval <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {agent.state === 'stale' && (
                          <div className="flex items-center gap-3 text-xs text-text-secondary">
                            <span>Last heartbeat: {agent.lastHeartbeat}</span>
                            <button className="text-status-blocked hover:text-red-700 font-medium flex items-center gap-1 transition-colors">
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
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider px-1">
            IDLE AGENTS
          </h3>
          <div className="flex flex-col border border-border rounded-lg bg-surface divide-y divide-border overflow-hidden">
            {idleAgents.map(agent => (
              <div key={agent.id} className="flex flex-col gap-3 p-4 transition-colors hover:bg-surface-secondary">
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <Circle className="h-3 w-3 fill-current text-text-tertiary" />
                  <span className="inline-block w-32 font-semibold text-text-primary">{agent.name}</span>
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
          <DialogOverlay />
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
  );
}
