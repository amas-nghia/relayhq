import { useMemo, useState, type ReactNode } from 'react'
import { Bot, Check, CheckCircle2, Clock3, ExternalLink, FileText, Link2, Lock, ShieldAlert, SquareCheckBig, X } from 'lucide-react'
import clsx from 'clsx'

import { useAppStore } from '../../store/appStore'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader } from '../ui/card'

function readSection(body: string | undefined, heading: string): string | null {
  if (!body) return null
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = body.match(new RegExp(`(?:^|\\n)##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i'))
  const value = match?.[1]?.trim()
  return value && value.length > 0 ? value : null
}

function readBulletItems(body: string | undefined, heading: string): string[] {
  const section = readSection(body, heading)
  if (!section) return []
  return section
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim())
    .filter(Boolean)
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-text-tertiary">{title}</h3>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function EmptyCopy({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-text-tertiary">{children}</p>
}

export function DetailPanel({ taskId }: { taskId: string }) {
  const task = useAppStore(state => state.tasks.find(t => t.id === taskId))
  const closeDetail = useAppStore(state => state.closeTaskDetail)
  const approveTask = useAppStore(state => state.approveTask)
  const rejectTask = useAppStore(state => state.rejectTask)
  const agent = useAppStore(state => state.agents.find(a => a.id === task?.assigneeId))
  const project = useAppStore(state => state.projects.find(p => p.id === task?.projectId))
  const auditLogs = useAppStore(state => state.auditLogs)
  const isMutating = useAppStore(state => state.isMutating)
  const mutationError = useAppStore(state => state.mutationError)
  const [rejectReason, setRejectReason] = useState(task?.approvalReason || '')

  const sections = useMemo(() => {
    const body = task?.description
    return {
      objective: readSection(body, 'Objective'),
      acceptanceCriteria: readBulletItems(body, 'Acceptance Criteria'),
      constraints: readBulletItems(body, 'Constraints'),
      contextFiles: readBulletItems(body, 'Context Files'),
    }
  }, [task?.description])

  const taskAuditLogs = useMemo(
    () => auditLogs.filter(entry => entry.taskId === taskId).slice(0, 8),
    [auditLogs, taskId],
  )

  if (!task) return null

  const links = task.links ?? []
  const dependsOn = task.dependsOn ?? []
  const approvalIds = task.approvalIds ?? []
  const tags = task.tags ?? []

  return (
    <div className="flex h-full flex-col bg-surface-secondary">
      <div className="flex items-center justify-between border-b border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={closeDetail}>
            <X className="w-4 h-4" />
          </Button>
          <span>{task.id}</span>
        </div>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={closeDetail}>
          <X className="w-5 h-5 text-text-secondary" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4 pb-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-text-primary">{task.title}</h2>
                <div className="flex flex-wrap gap-2">
                  <span className={clsx(
                    'rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                    task.status === 'in-progress' && 'bg-blue-50 text-status-active',
                    task.status === 'waiting-approval' && 'bg-amber-50 text-status-waiting',
                    task.status === 'blocked' && 'bg-red-50 text-status-blocked',
                    task.status === 'done' && 'bg-green-50 text-status-done',
                    task.status === 'todo' && 'bg-slate-100 text-status-todo',
                    task.status === 'cancelled' && 'bg-slate-200 text-text-secondary',
                  )}>
                    {task.status.replace('-', ' ')}
                  </span>
                  <span className={clsx(
                    'rounded-sm border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
                    task.priority === 'critical' ? 'border-red-200 bg-red-50 text-status-blocked' :
                    task.priority === 'high' ? 'border-amber-200 bg-amber-50 text-status-waiting' :
                    task.priority === 'low' ? 'border-border bg-surface-secondary text-text-secondary' :
                    'border-blue-200 bg-blue-50 text-status-active',
                  )}>
                    {task.priority}
                  </span>
                  {task.isStale && (
                    <span className="rounded-sm border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-status-blocked">
                      stale
                    </span>
                  )}
                </div>
              </div>

              <div className="min-w-[120px] space-y-1 text-right">
                <div className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Progress</div>
                <div className="text-lg font-semibold text-text-primary">{task.progress}%</div>
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-border">
                  <div className={clsx('h-full', task.status === 'done' ? 'bg-status-done' : 'bg-accent')} style={{ width: `${task.progress}%` }} />
                </div>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-text-secondary sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-2">
                <span>Assignee</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                  {agent ? <Bot className="w-4 h-4 text-accent" /> : null}
                  {agent?.name || 'Unassigned'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-2">
                <span>Project</span>
                <span className="font-medium text-text-primary">{project?.name || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-2">
                <span>Started</span>
                <span className="font-medium text-text-primary">{formatTimestamp(task.executionStartedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-2">
                <span>Last heartbeat</span>
                <span className="font-medium text-text-primary">{task.lastSeen || '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-2">
                <span>Updated</span>
                <span className="font-medium text-text-primary">{formatTimestamp(task.updatedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-2">
                <span>Completed</span>
                <span className="font-medium text-text-primary">{formatTimestamp(task.completedAt)}</span>
              </div>
            </div>
          </div>

          <Section title="Objective">
            {sections.objective ? <p className="text-sm leading-6 text-text-primary">{sections.objective}</p> : <EmptyCopy>No objective has been written for this task yet.</EmptyCopy>}
          </Section>

          <Section title="Acceptance Criteria">
            {sections.acceptanceCriteria.length > 0 ? (
              <div className="space-y-2">
                {sections.acceptanceCriteria.map(item => (
                  <div key={item} className="flex items-start gap-2 text-sm text-text-primary">
                    <SquareCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyCopy>No acceptance criteria recorded yet.</EmptyCopy>}
          </Section>

          <Section title="Context">
            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.2em] text-text-tertiary">Context Files</div>
                {sections.contextFiles.length > 0 ? (
                  <div className="space-y-2">
                    {sections.contextFiles.map(item => (
                      <div key={item} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary">
                        <FileText className="h-4 w-4 text-accent" />
                        {item}
                      </div>
                    ))}
                  </div>
                ) : <EmptyCopy>No context files linked yet.</EmptyCopy>}
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.2em] text-text-tertiary">Links</div>
                {links.length > 0 ? (
                  <div className="space-y-2">
                    {links.map(link => (
                      <div key={`${link.projectId}-${link.threadId}`} className="flex items-center gap-2 rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary">
                        <Link2 className="h-4 w-4 text-accent" />
                        <span>{link.projectId}</span>
                        <span className="text-text-tertiary">/</span>
                        <span>{link.threadId}</span>
                      </div>
                    ))}
                  </div>
                ) : <EmptyCopy>No linked threads or related work yet.</EmptyCopy>}
              </div>

              {(task.sourceIssueId || task.parentTaskId || dependsOn.length > 0) && (
                <div className="grid gap-2 text-sm text-text-secondary">
                  {task.sourceIssueId && <div><span className="text-text-tertiary">Source issue:</span> <span className="font-medium text-text-primary">{task.sourceIssueId}</span></div>}
                  {task.parentTaskId && <div><span className="text-text-tertiary">Parent task:</span> <span className="font-medium text-text-primary">{task.parentTaskId}</span></div>}
                  {dependsOn.length > 0 && <div><span className="text-text-tertiary">Depends on:</span> <span className="font-medium text-text-primary">{dependsOn.join(', ')}</span></div>}
                </div>
              )}
            </div>
          </Section>

          <Section title="Constraints">
            {sections.constraints.length > 0 ? (
              <div className="space-y-2">
                {sections.constraints.map(item => (
                  <div key={item} className="flex items-start gap-2 text-sm text-text-primary">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-waiting" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            ) : <EmptyCopy>No explicit constraints recorded for this task.</EmptyCopy>}
          </Section>

          <Section title="Execution Notes">
            {task.executionNotes ? <p className="text-sm leading-6 text-text-primary">{task.executionNotes}</p> : <EmptyCopy>No execution notes captured yet.</EmptyCopy>}
          </Section>

          <Section title="Approval">
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <span className={clsx(
                  'rounded-sm px-2 py-1 text-[11px] font-bold uppercase tracking-wider',
                  task.approvalOutcome === 'approved' && 'bg-green-50 text-status-done',
                  task.approvalOutcome === 'rejected' && 'bg-red-50 text-status-blocked',
                  task.approvalOutcome === 'pending' && 'bg-amber-50 text-status-waiting',
                )}>
                  {task.approvalOutcome || 'pending'}
                </span>
                {task.approvalNeeded && <span className="rounded-sm border border-border bg-surface-secondary px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-text-secondary">approval needed</span>}
              </div>

              <div className="grid gap-2 text-text-secondary">
                <div><span className="text-text-tertiary">Requested by:</span> <span className="font-medium text-text-primary">{task.approvalRequestedBy || '—'}</span></div>
                <div><span className="text-text-tertiary">Requested at:</span> <span className="font-medium text-text-primary">{task.requestedApprovalTime || '—'}</span></div>
                <div><span className="text-text-tertiary">Approved by:</span> <span className="font-medium text-text-primary">{task.approvedBy || '—'}</span></div>
                <div><span className="text-text-tertiary">Approved at:</span> <span className="font-medium text-text-primary">{formatTimestamp(task.approvedAt)}</span></div>
              </div>

              {task.approvalReason ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  {task.approvalReason}
                </div>
              ) : <EmptyCopy>No approval note recorded yet.</EmptyCopy>}

              {task.status === 'waiting-approval' && (
                <div className="space-y-3 rounded-lg border border-border bg-surface-secondary p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-status-waiting">
                    <Clock3 className="w-4 h-4" />
                    Waiting for approval
                  </div>
                  <textarea value={rejectReason} onChange={event => setRejectReason(event.target.value)} rows={3} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary" placeholder="Reason for rejection" />
                  <div className="flex gap-2">
                    <button onClick={() => void approveTask(task.id)} disabled={isMutating} className="flex-1 rounded-md bg-status-done py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60">
                      Approve
                    </button>
                    <button onClick={() => void rejectTask(task.id, rejectReason || task.approvalReason || 'Rejected from detail panel')} disabled={isMutating} className="flex-1 rounded-md bg-status-blocked py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60">
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Section>

          <Section title="Result">
            {task.result ? <p className="text-sm leading-6 text-text-primary">{task.result}</p> : <EmptyCopy>No result has been written yet.</EmptyCopy>}
          </Section>

          <Section title="Activity">
            {taskAuditLogs.length > 0 ? (
              <div className="space-y-3">
                {taskAuditLogs.map(log => (
                  <div key={log.id} className="rounded-lg border border-border bg-surface-secondary p-3">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="font-medium text-text-primary">{log.action}</span>
                      <span className="text-xs text-text-tertiary">{log.time}</span>
                    </div>
                    <div className="text-sm text-text-secondary">{log.description}</div>
                  </div>
                ))}
              </div>
            ) : <EmptyCopy>No audit activity captured for this task yet.</EmptyCopy>}
          </Section>

          <Section title="Vault Record">
            <div className="space-y-3 text-sm text-text-secondary">
              <div className="flex items-center justify-between gap-3">
                <span>Source path</span>
                <span className="truncate font-medium text-text-primary">tasks/{task.id}.md</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Created</span>
                <span className="font-medium text-text-primary">{formatTimestamp(task.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Lock owner</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                  {task.lockedBy ? <Lock className="h-4 w-4 text-text-tertiary" /> : null}
                  {task.lockedBy || 'Unlocked'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Lock expires</span>
                <span className="font-medium text-text-primary">{formatTimestamp(task.lockExpiresAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Approval records</span>
                <span className="font-medium text-text-primary">{approvalIds.length}</span>
              </div>
            </div>
          </Section>

          {mutationError && <p className="text-sm text-status-blocked">{mutationError}</p>}
        </div>
      </div>

      <div className="mt-auto border-t border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {tags.length > 0 ? tags.map(tag => (
            <span key={tag} className="rounded border border-border bg-surface-secondary px-2 py-1 text-xs text-text-secondary">
              {tag}
            </span>
          )) : <span className="text-xs text-text-tertiary">No tags</span>}
        </div>
        <button className="inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent/80">
          Open full record <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
