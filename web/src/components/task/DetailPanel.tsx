import { X, ExternalLink, Bot, Check, Clock } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import clsx from 'clsx';

export function DetailPanel({ taskId }: { taskId: string }) {
  const task = useAppStore(state => state.tasks.find(t => t.id === taskId));
  const closeDetail = useAppStore(state => state.closeTaskDetail);
  const approveTask = useAppStore(state => state.approveTask);
  const rejectTask = useAppStore(state => state.rejectTask);
  const agent = useAppStore(state => state.agents.find(a => a.id === taskId ? undefined : task?.assigneeId));
  const project = useAppStore(state => state.projects.find(p => p.id === task?.projectId));

  if (!task) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <button onClick={closeDetail} className="p-1 hover:bg-surface-secondary rounded-md hidden md:block">
            <X className="w-4 h-4" />
          </button>
          <span>{task.id}</span>
        </div>
        <button onClick={closeDetail} className="p-1 md:hidden">
          <X className="w-5 h-5 text-text-secondary" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        <div>
          <h2 className="text-[18px] font-semibold text-text-primary mb-2">{task.title}</h2>
          <div className="flex flex-wrap gap-2">
            <span className={clsx(
              "px-2 py-0.5 rounded-sm text-[11px] font-bold uppercase tracking-wider",
              task.status === 'in-progress' && "bg-blue-50 text-status-active",
              task.status === 'waiting-approval' && "bg-amber-50 text-status-waiting",
              task.status === 'blocked' && "bg-red-50 text-status-blocked",
              task.status === 'done' && "bg-green-50 text-status-done",
              task.status === 'todo' && "bg-slate-100 text-status-todo"
            )}>
              {task.status.replace('-', ' ')}
            </span>
            {task.priority !== 'medium' && (
              <span className={clsx(
                "px-2 py-0.5 rounded-sm text-[11px] font-bold uppercase tracking-wider border",
                task.priority === 'critical' ? "border-red-200 text-status-blocked bg-red-50" :
                task.priority === 'high' ? "border-amber-200 text-status-waiting bg-amber-50" :
                "border-border text-text-secondary bg-surface-secondary"
              )}>
                {task.priority}
              </span>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="bg-surface-secondary rounded-lg p-3 flex flex-col gap-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-text-tertiary">Assignee</span>
            <div className="flex items-center gap-1.5 font-medium">
              {agent ? (
                <>
                  <Bot className="w-4 h-4 text-accent" />
                  {agent.name}
                </>
              ) : (
                <span className="text-text-tertiary">—</span>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-text-tertiary">Project</span>
            <span className="font-medium">{project?.name || '—'}</span>
          </div>
          <div className="flex justify-between items-start">
            <span className="text-text-tertiary">Progress</span>
            <div className="flex flex-col items-end gap-1">
              <span className="font-medium">{task.progress}%</span>
              <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
                <div 
                  className={clsx("h-full", task.status === 'done' ? "bg-status-done" : "bg-accent")} 
                  style={{ width: `${task.progress}%` }} 
                />
              </div>
            </div>
          </div>
          {task.lastSeen && (
            <div className="flex justify-between items-center">
              <span className="text-text-tertiary">Last seen</span>
              <span className="text-text-secondary">{task.lastSeen}</span>
            </div>
          )}
        </div>

        {/* Action Blocks */}
        {task.status === 'waiting-approval' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-status-waiting font-bold text-sm">
              <Clock className="w-4 h-4" />
              WAITING APPROVAL
            </div>
            <p className="text-sm font-medium text-amber-950">"{task.approvalReason}"</p>
            <p className="text-xs text-amber-800/70">Requested by {agent?.name} · {task.requestedApprovalTime}</p>
            <div className="flex gap-2 mt-2">
              <button 
                onClick={() => approveTask(task.id)}
                className="flex-1 bg-status-done hover:bg-green-700 text-white text-sm font-medium py-2 rounded-md transition-colors flex justify-center items-center gap-1"
              >
                <Check className="w-4 h-4" /> Approve
              </button>
              <button 
                onClick={() => rejectTask(task.id, task.approvalReason || 'Rejected from detail panel')}
                className="flex-1 bg-status-blocked hover:bg-red-700 text-white text-sm font-medium py-2 rounded-md transition-colors flex justify-center items-center gap-1"
              >
                <X className="w-4 h-4" /> Reject
              </button>
            </div>
          </div>
        )}

        {task.status === 'blocked' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-status-blocked font-bold text-sm">
              <div className="w-2 h-2 rounded-full bg-status-blocked" />
              BLOCKED
            </div>
            <p className="text-sm font-medium text-red-950">"{task.blockedReason}"</p>
            <p className="text-xs text-red-800/70">Since {task.blockedTime}</p>
            <div className="flex gap-2 mt-2">
              <button className="flex-1 bg-white border border-border hover:bg-surface-secondary text-text-primary text-sm font-medium py-2 rounded-md transition-colors">
                Reassign
              </button>
              <button className="flex-1 bg-white border border-border hover:bg-surface-secondary text-text-primary text-sm font-medium py-2 rounded-md transition-colors">
                Mark Cancelled
              </button>
            </div>
          </div>
        )}

        {/* Timeline (Mocked) */}
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Timeline</h3>
          <div className="relative pl-3 border-l-2 border-border ml-2 flex flex-col gap-4">
            <div className="relative">
              <div className="absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full bg-text-tertiary border-2 border-surface" />
              <div className="text-sm flex justify-between">
                <span className="text-text-secondary">todo</span>
                <span className="text-text-tertiary text-xs">Apr 23 10:00</span>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full bg-status-active border-2 border-surface" />
              <div className="text-sm flex justify-between">
                <span className="text-text-primary font-medium">in-progress</span>
                <span className="text-text-tertiary text-xs">Apr 23 10:30</span>
              </div>
            </div>
            {task.status === 'waiting-approval' && (
              <div className="relative">
                <div className="absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full bg-status-waiting ring-4 ring-amber-50" />
                <div className="text-sm flex justify-between">
                  <span className="text-status-waiting font-medium">waiting-approval</span>
                  <span className="text-status-waiting/70 text-xs text-right">Just now</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-surface-sidebar mt-auto">
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="text-xs text-text-tertiary mr-1">Tags:</span>
          {task.tags.map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-surface border border-border rounded text-xs text-text-secondary">
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-tertiary truncate">Vault: tasks/{task.id}.md</span>
          <button className="text-accent hover:text-accent-light font-medium flex items-center gap-1 transition-colors whitespace-nowrap">
            Open full <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
