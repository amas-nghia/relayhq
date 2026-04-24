import { ArrowRight, Circle, Play } from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '../store/appStore';

export function AgentsView() {
  const agents = useAppStore(state => state.agents);
  const tasks = useAppStore(state => state.tasks);
  const projects = useAppStore(state => state.projects);
  const openDetail = useAppStore(state => state.openTaskDetail);
  const activeAgents = agents.filter(a => a.state !== 'idle');
  const idleAgents = agents.filter(a => a.state === 'idle');

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-full gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text-primary">Agents</h1>
        <p className="text-sm text-text-secondary">
          {activeAgents.length} active / {agents.length} total
        </p>
      </div>

      <div className="flex flex-col gap-6">
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
                <div key={agent.id} className="p-4 hover:bg-surface-secondary transition-colors group cursor-pointer flex flex-col gap-2">
                  <div className="flex items-center justify-between">
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
                        <div className="flex items-center gap-2 text-sm text-text-primary font-medium">
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
