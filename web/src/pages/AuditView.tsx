import { useAppStore } from '../store/appStore';
import { ChevronDown, Bot, User } from 'lucide-react';

export function AuditView() {
  const auditLogs = useAppStore(state => state.auditLogs);
  const agents = useAppStore(state => state.agents);
  return (
    <div className="max-w-4xl mx-auto flex flex-col h-full">
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-2xl font-bold text-text-primary">Audit Trail</h1>
        <span className="text-text-tertiary">—</span>
        <button className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors hover:bg-surface-secondary px-2 py-1 rounded-md">
          All projects <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col gap-6 bg-surface border border-border rounded-lg p-6">
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider pl-4">
            TODAY
          </h3>
          
          <div className="relative border-l-2 border-border ml-5 pl-5 flex flex-col gap-6">
            {auditLogs.map(log => {
              const agent = agents.find(a => a.id === log.agentId);
              
              return (
                <div key={log.id} className="relative">
                  <div className="absolute -left-[27px] top-1">
                    {log.agentId ? (
                      <div className="bg-surface border-2 border-accent rounded-full p-0.5">
                        <Bot className="w-3 h-3 text-accent" />
                      </div>
                    ) : (
                      <div className="bg-surface border-2 border-status-done rounded-full p-0.5">
                        <User className="w-3 h-3 text-status-done" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-start gap-4">
                    <span className="text-sm font-semibold text-text-tertiary w-12 shrink-0 pt-0.5">
                      {log.time}
                    </span>
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="text-sm">
                        {log.agentId ? (
                          <><span className="font-semibold text-text-primary">🤖 {agent?.name}</span> <span className="text-text-secondary">{log.action}</span> for <span className="font-medium text-text-primary">{log.taskId}</span></>
                        ) : (
                          <><span className="font-semibold text-status-done">✓ amas</span> <span className="text-text-secondary">{log.action}</span> for <span className="font-medium text-text-primary">{log.taskId}</span></>
                        )}
                      </div>
                      <div className="text-sm text-text-secondary/80 bg-surface-secondary p-2 rounded max-w-lg border border-border/50">
                        {log.description}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4 mt-4 opacity-70">
          <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider pl-4">
            YESTERDAY
          </h3>
          
          <div className="relative border-l-2 border-border ml-5 pl-5 flex flex-col gap-6">
             <div className="relative">
                <div className="absolute -left-[27px] top-1">
                  <div className="bg-surface border-2 border-text-tertiary rounded-full p-0.5">
                    <User className="w-3 h-3 text-text-tertiary" />
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <span className="text-sm font-semibold text-text-tertiary w-12 shrink-0 pt-0.5">
                    16:20
                  </span>
                  <div className="flex-1 flex flex-col gap-1">
                    <div className="text-sm text-text-secondary">
                      <span className="font-semibold text-text-primary">amas</span> created task-012 (Delete Legacy Data)
                    </div>
                    <div className="text-sm text-text-secondary/80 bg-surface-secondary p-2 rounded max-w-lg border border-border/50">
                      Assigned to agent-cleanup, priority: high
                    </div>
                  </div>
                </div>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}
