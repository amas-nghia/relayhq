import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { Bot, User } from 'lucide-react';

export function AuditView() {
  const auditLogs = useAppStore(state => state.auditLogs);
  const agents = useAppStore(state => state.agents);
  const openDetail = useAppStore(state => state.openTaskDetail);

  const groupedLogs = useMemo(() => {
    const today: typeof auditLogs = []
    const earlier: typeof auditLogs = []
    auditLogs.forEach((log, index) => {
      if (index < 10) today.push(log)
      else earlier.push(log)
    })
    return [
      { label: 'LATEST', rows: today },
      { label: 'EARLIER', rows: earlier },
    ].filter(group => group.rows.length > 0)
  }, [auditLogs])

  const actionIcon = (log: (typeof auditLogs)[number]) => {
    if (log.agentId) return <Bot className="w-3 h-3 text-accent" />
    return <User className="w-3 h-3 text-status-done" />
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-full">
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-2xl font-bold text-text-primary">Audit Trail</h1>
        <span className="text-text-tertiary">—</span>
        <span className="text-sm font-medium text-text-secondary">Live vault-backed timeline</span>
      </div>

      <div className="flex flex-col gap-6 bg-surface border border-border rounded-lg p-6">
        {groupedLogs.map(group => (
          <div key={group.label} className="flex flex-col gap-4">
            <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider pl-4">{group.label}</h3>
            <div className="relative border-l-2 border-border ml-5 pl-5 flex flex-col gap-6">
              {group.rows.map(log => {
                const agent = agents.find(a => a.id === log.agentId)
                return (
                  <button
                    key={log.id}
                    onClick={() => log.taskId && openDetail(log.taskId)}
                    className="relative text-left"
                    disabled={!log.taskId}
                  >
                    <div className="absolute -left-[27px] top-1 bg-surface border-2 border-border rounded-full p-0.5">
                      {actionIcon(log)}
                    </div>
                    <div className="flex items-start gap-4">
                      <span className="text-sm font-semibold text-text-tertiary w-16 shrink-0 pt-0.5">{log.time}</span>
                      <div className="flex-1 flex flex-col gap-1">
                        <div className="text-sm">
                          {log.agentId ? (
                            <><span className="font-semibold text-text-primary">🤖 {agent?.name || log.agentId}</span> <span className="text-text-secondary">{log.action}</span> <span className="font-medium text-text-primary">{log.taskId}</span></>
                          ) : (
                            <><span className="font-semibold text-status-done">✓ {log.userId || 'human-user'}</span> <span className="text-text-secondary">{log.action}</span> <span className="font-medium text-text-primary">{log.taskId}</span></>
                          )}
                        </div>
                        <div className="text-sm text-text-secondary/80 bg-surface-secondary p-2 rounded max-w-lg border border-border/50">
                          {log.description}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
