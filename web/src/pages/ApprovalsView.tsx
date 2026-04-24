import { useAppStore } from '../store/appStore';
import { Check, X, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { useState } from 'react';

export function ApprovalsView() {
  const tasks = useAppStore(state => state.tasks);
  const agents = useAppStore(state => state.agents);
  const projects = useAppStore(state => state.projects);
  const pendingApprovals = tasks.filter(t => t.status === 'waiting-approval');
  const approveTask = useAppStore(state => state.approveTask);
  const rejectTask = useAppStore(state => state.rejectTask);
  const isMutating = useAppStore(state => state.isMutating);
  const mutationError = useAppStore(state => state.mutationError);
  const openDetail = useAppStore(state => state.openTaskDetail);
  const [rejectingTaskId, setRejectingTaskId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  return (
    <div className="max-w-4xl mx-auto flex flex-col h-full gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text-primary">Approvals</h1>
        <p className="text-sm text-text-secondary">
          {pendingApprovals.length} pending
        </p>
      </div>

      {pendingApprovals.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-surface border border-border rounded-lg border-dashed gap-4">
          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
            <Check className="w-6 h-6 text-status-done" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-text-primary">All clear</h2>
            <p className="text-sm text-text-secondary max-w-sm">Nothing waiting for approval.</p>
          </div>
          <button className="text-accent hover:text-accent-light text-sm font-medium transition-colors">
            View resolved →
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold text-text-tertiary uppercase tracking-wider px-1">
              URGENT — waiting longest first
            </h3>
            
            {pendingApprovals.map(task => {
              const agent = agents.find(a => a.id === task.assigneeId);
              const project = projects.find(p => p.id === task.projectId);
              
              return (
                <div key={task.id} className="bg-surface border border-amber-200 rounded-lg p-5 shadow-sm hover:shadow-hover transition-shadow relative overflow-hidden flex flex-col gap-4">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-status-waiting" />
                  
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary">{task.id}</span>
                        <span className="text-text-tertiary text-sm">•</span>
                        <span className="text-lg font-medium text-text-primary leading-tight">{task.title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <span className="font-medium">🤖 {agent?.name || 'Unknown'}</span>
                        <span>•</span>
                        <span>{project?.name || 'Unknown project'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-amber-50 rounded p-3 flex flex-col gap-1">
                    <p className="text-sm font-medium text-amber-950">"{task.approvalReason}"</p>
                    <p className="text-xs text-amber-800/70">Requested {task.requestedApprovalTime}</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => void approveTask(task.id)}
                      disabled={isMutating}
                      className="bg-status-done hover:bg-green-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <Check className="w-4 h-4" /> Approve
                    </button>
                    <button 
                      onClick={() => { setRejectingTaskId(task.id); setRejectReason(task.approvalReason || '') }}
                      className="bg-status-blocked hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <X className="w-4 h-4" /> Reject
                    </button>
                    <div className="flex-1 flex justify-end">
                      <button 
                        onClick={() => openDetail(task.id)}
                        className="text-accent hover:bg-accent-light px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5"
                      >
                        View task <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {rejectingTaskId === task.id && (
                    <div className="mt-3 flex flex-col gap-3 rounded-md border border-border bg-surface-secondary p-3">
                      <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} className="px-3 py-2 bg-surface border border-border rounded-md text-sm" placeholder="Reason for rejection" />
                      <div className="flex gap-2">
                        <button
                          onClick={() => void rejectTask(task.id, rejectReason || 'Rejected from approvals view').then(() => { setRejectingTaskId(null); setRejectReason('') })}
                          disabled={isMutating || rejectReason.trim().length === 0}
                          className="bg-status-blocked hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
                        >
                          Confirm reject
                        </button>
                        <button onClick={() => { setRejectingTaskId(null); setRejectReason('') }} className="bg-surface border border-border text-text-secondary text-sm font-medium py-2 px-4 rounded-md transition-colors">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {mutationError && <p className="text-sm text-status-blocked">{mutationError}</p>}

          <div className="flex items-start">
            <button className="text-sm text-text-secondary font-medium hover:text-text-primary flex items-center gap-1">
              <span className="text-xs">▶</span> Show 12 resolved approvals
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
