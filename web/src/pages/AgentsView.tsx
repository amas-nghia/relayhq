import { ArrowRight, Circle, Play } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../store/appStore';

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

export function AgentsView() {
  const agents = useAppStore(state => state.agents);
  const tasks = useAppStore(state => state.tasks);
  const projects = useAppStore(state => state.projects);
  const openDetail = useAppStore(state => state.openTaskDetail);
  const activeAgents = agents.filter(a => a.state !== 'idle');
  const idleAgents = agents.filter(a => a.state === 'idle');

  return (
    <div className="flex min-h-full w-full flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text-primary">Agents</h1>
        <p className="text-sm text-text-secondary">
          {activeAgents.length} active / {agents.length} total
        </p>
      </div>

      <div className="flex flex-col gap-6">
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
              <div key={agent.id} className="p-4 flex items-center gap-2 text-sm text-text-secondary hover:bg-surface-secondary transition-colors cursor-pointer">
                <Circle className="w-3 h-3 fill-current text-text-tertiary" />
                <span className="font-semibold text-text-primary inline-block w-32">{agent.name}</span>
                <span className="text-text-tertiary">Idle</span>
                <span className="text-text-tertiary">•</span>
                <span>No active task</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
