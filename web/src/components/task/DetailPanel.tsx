import { useNavigate } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bot, Check, CheckCircle2, Clock3, ExternalLink, FileText, Link2, Lock, Repeat2, ShieldAlert, SquareCheckBig, User, X } from 'lucide-react'
import clsx from 'clsx'

import { relayhqApi } from '../../api/client'
import { useAppStore } from '../../store/appStore'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader } from '../ui/card'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'

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

function formatRelativeTimestamp(value: string | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const diffMs = Date.now() - date.getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function isAgentComment(author: string): boolean {
  const normalized = author.trim().toLowerCase()
  return normalized.includes('agent') || normalized.includes('claude') || normalized.includes('bot')
}

function readInitials(author: string): string {
  return author
    .replace(/^@/, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'OP'
}

function formatHistoryLabel(entry: { action: string; actor: string }): string {
  switch (entry.action) {
    case 'created':
      return `Created by ${entry.actor}`
    case 'claimed':
      return `Claimed by ${entry.actor}`
    case 'moved-to-review':
      return `Moved to review by ${entry.actor}`
    case 'moved-to-done':
      return `Moved to done by ${entry.actor}`
    case 'scheduled':
      return `Scheduled by ${entry.actor}`
    case 'approval-requested':
      return `Approval requested by ${entry.actor}`
    case 'approved':
      return `Approved by ${entry.actor}`
    case 'rejected':
      return `Rejected by ${entry.actor}`
    default:
      return `${entry.action.replace(/-/g, ' ')} by ${entry.actor}`
  }
}

function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
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

const statusClasses: Record<string, string> = {
  'in-progress': 'border-status-active/20 bg-brand-muted text-status-active',
  review: 'border-status-active/20 bg-brand-muted text-status-active',
  'waiting-approval': 'border-status-waiting/20 bg-status-waiting/10 text-status-waiting',
  blocked: 'border-status-blocked/20 bg-status-blocked/10 text-status-blocked',
  done: 'border-status-done/20 bg-status-done/10 text-status-done',
  todo: 'border-border bg-surface-secondary text-status-todo',
  cancelled: 'border-border bg-surface-secondary text-text-secondary',
}

const priorityClasses: Record<string, string> = {
  critical: 'border-status-blocked/20 bg-status-blocked/10 text-status-blocked',
  high: 'border-status-waiting/20 bg-status-waiting/10 text-status-waiting',
  medium: 'border-status-active/20 bg-brand-muted text-status-active',
  low: 'border-border bg-surface-secondary text-text-secondary',
}

const approvalClasses: Record<string, string> = {
  approved: 'border-status-done/20 bg-status-done/10 text-status-done',
  rejected: 'border-status-blocked/20 bg-status-blocked/10 text-status-blocked',
  pending: 'border-status-waiting/20 bg-status-waiting/10 text-status-waiting',
}

const statusLabels: Record<string, string> = {
  'in-progress': 'in progress',
  review: 'in review',
  'waiting-approval': 'awaiting approval',
  blocked: 'blocked',
  done: 'done',
  todo: 'todo',
  cancelled: 'cancelled',
}

export function DetailPanel({ taskId, mode = 'preview' }: { taskId: string; mode?: 'preview' | 'page' }) {
  const navigate = useNavigate()
  const task = useAppStore(state => state.tasks.find(t => t.id === taskId))
  const closeDetail = useAppStore(state => state.closeTaskDetail)
  const approveTask = useAppStore(state => state.approveTask)
  const rejectTask = useAppStore(state => state.rejectTask)
  const startAutoRun = useAppStore(state => state.startAutoRun)
  const fetchReadModel = useAppStore(state => state.fetchReadModel)
  const isLoading = useAppStore(state => state.isLoading)
  const agent = useAppStore(state => state.agents.find(a => a.id === task?.assigneeId))
  const project = useAppStore(state => state.projects.find(p => p.id === task?.projectId))
  const tasks = useAppStore(state => state.tasks)
  const auditLogs = useAppStore(state => state.auditLogs)
  const isMutating = useAppStore(state => state.isMutating)
  const [rejectReason, setRejectReason] = useState(task?.approvalReason || '')
  const [comments, setComments] = useState<ReadonlyArray<{ author: string; timestamp: string; body: string }>>([])
  const [commentBody, setCommentBody] = useState('')
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsSaving, setCommentsSaving] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [nextRunAtInput, setNextRunAtInput] = useState('')
  const [cronScheduleInput, setCronScheduleInput] = useState('')

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

  const taskHistory = useMemo(
    () => [...(task?.history ?? [])].reverse().slice(0, 8),
    [task?.history],
  )

  const subtasks = useMemo(
    () => tasks.filter(entry => entry.parentTaskId === taskId),
    [tasks, taskId],
  )

  const recurringRootId = task?.parentTaskId ?? task?.id ?? taskId
  const recurringRunCount = useMemo(
    () => tasks.filter(entry => (entry.parentTaskId ?? entry.id) === recurringRootId && entry.cronSchedule === task?.cronSchedule).length,
    [recurringRootId, task?.cronSchedule, tasks],
  )

  const loadComments = useCallback(async () => {
    setCommentsLoading(true)
    setCommentsError(null)
    try {
      const response = await relayhqApi.getTaskComments(taskId)
      setComments(response.data.comments)
    } catch (error) {
      setCommentsError(error instanceof Error ? error.message : 'Unable to load comments.')
    } finally {
      setCommentsLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  useEffect(() => {
    if (!task && !isLoading) {
      void fetchReadModel()
    }
  }, [fetchReadModel, isLoading, task])

  useEffect(() => {
    setCronScheduleInput(task?.cronSchedule ?? '')
  }, [task?.cronSchedule])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadComments()
    }, 30000)

    return () => window.clearInterval(interval)
  }, [loadComments])

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-text-tertiary">
        Loading task detail…
      </div>
    )
  }

  const links = task.links ?? []
  const dependsOn = task.dependsOn ?? []
  const approvalIds = task.approvalIds ?? []
  const tags = task.tags ?? []

  const submitComment = async () => {
    if (commentBody.trim().length === 0) return
    setCommentsSaving(true)
    setCommentsError(null)
    try {
      const response = await relayhqApi.addTaskComment(task.id, { author: 'operator', body: commentBody })
      setComments(response.data.comments)
      setCommentBody('')
      await fetchReadModel()
    } catch (error) {
      setCommentsError(error instanceof Error ? error.message : 'Unable to add comment.')
    } finally {
      setCommentsSaving(false)
    }
  }

  const scheduleTask = async (nextRunAt: string, reason: string) => {
    await relayhqApi.scheduleTask(task.id, { actorId: 'relayhq-web', nextRunAt, reason })
    await fetchReadModel()
  }

  const unscheduleTask = async () => {
    await relayhqApi.patchTask(task.id, {
      actorId: 'relayhq-web',
      patch: { status: 'todo', column: 'todo', next_run_at: null, blocked_reason: null },
    })
    await fetchReadModel()
  }

  const saveRecurringSchedule = async () => {
    await relayhqApi.patchTask(task.id, {
      actorId: 'relayhq-web',
      patch: {
        cron_schedule: cronScheduleInput.trim().length > 0 ? cronScheduleInput.trim() : null,
      },
    })
    await fetchReadModel()
  }

  return (
    <div className="flex h-full flex-col bg-surface-secondary">
      <div className="flex items-center justify-between border-b border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          {mode === 'preview' && (
            <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={closeDetail}>
              <X className="w-4 h-4" />
            </Button>
          )}
          <span>{task.id}</span>
        </div>
        {mode === 'preview' && (
          <Button variant="ghost" size="icon" className="md:hidden" onClick={closeDetail}>
            <X className="w-5 h-5 text-text-secondary" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4 pb-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-text-primary">{task.title}</h2>
                <div className="flex flex-wrap gap-2">
                  <span className={clsx('rounded-sm border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider', statusClasses[task.status] ?? 'border-border bg-surface-secondary text-text-secondary')}>
                    {statusLabels[task.status] ?? task.status.replace('-', ' ')}
                  </span>
                  <span className={clsx('rounded-sm border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider', priorityClasses[task.priority] ?? 'border-status-active/20 bg-brand-muted text-status-active')}>
                    {task.priority}
                  </span>
                  {task.isStale && (
                    <span className="rounded-sm border border-status-blocked/20 bg-status-blocked/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-status-blocked">
                      stale
                    </span>
                  )}
                </div>
              </div>

              <div className="min-w-[120px] space-y-1 text-right">
                <div className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Progress</div>
                <div className="text-lg font-semibold text-text-primary">{task.progress}%</div>
                <div className="h-1.5 w-28 overflow-hidden rounded-full bg-border">
                  <div className={clsx('h-full', task.status === 'done' ? 'bg-status-done' : 'bg-brand')} style={{ width: `${task.progress}%` }} />
                </div>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-text-secondary sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-2">
                <span>Assignee</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                  {agent ? <Bot className="w-4 h-4 text-brand" /> : null}
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
              {task.model && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-2">
                  <span>Model</span>
                  <span className="font-medium text-text-primary">{task.model}</span>
                </div>
              )}
              {typeof task.tokensUsed === 'number' && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-2">
                  <span>Tokens used</span>
                  <span className="font-medium text-text-primary">{task.tokensUsed.toLocaleString()}</span>
                </div>
              )}
              {typeof task.costUsd === 'number' && (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-secondary px-3 py-2">
                  <span>Cost</span>
                  <span className="font-medium text-text-primary">${task.costUsd.toFixed(2)}</span>
                </div>
              )}
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
                    <SquareCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
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
                        <FileText className="h-4 w-4 text-brand" />
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
                        <Link2 className="h-4 w-4 text-brand" />
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

          <Section title="Subtasks">
            {subtasks.length > 0 ? (
              <div className="space-y-2">
                {subtasks.map((subtask) => (
                  <button
                    key={subtask.id}
                    type="button"
                    onClick={() => navigate(`/tasks/${subtask.id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-left"
                  >
                    <div>
                      <div className="text-sm font-medium text-text-primary">{subtask.title}</div>
                      <div className="text-xs text-text-tertiary">{subtask.id}</div>
                    </div>
                    <span className={clsx('rounded-sm border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider', statusClasses[subtask.status] ?? 'border-border bg-surface-secondary text-text-secondary')}>
                      {statusLabels[subtask.status] ?? subtask.status.replace('-', ' ')}
                    </span>
                  </button>
                ))}
              </div>
            ) : <EmptyCopy>No subtasks spawned from this task yet.</EmptyCopy>}
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
            {task.assigneeId && task.assigneeId !== 'unassigned' && task.status !== 'review' && task.status !== 'done' && task.status !== 'cancelled' && (
              <div className="mt-4">
                <Button type="button" variant="outline" onClick={() => void startAutoRun(task.id)} disabled={isMutating}>
                  {isMutating ? 'Starting…' : 'Auto-run'}
                </Button>
              </div>
            )}
          </Section>

          <Section title="Schedule">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void scheduleTask(new Date(Date.now() + 60 * 60 * 1000).toISOString(), 'Scheduled for 1 hour later')}>In 1h</Button>
                <Button variant="outline" size="sm" onClick={() => void scheduleTask(new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), 'Scheduled for 4 hours later')}>In 4h</Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const next = new Date()
                  next.setDate(next.getDate() + 1)
                  next.setHours(9, 0, 0, 0)
                  void scheduleTask(next.toISOString(), 'Scheduled for tomorrow 9am')
                }}>Tomorrow 9am</Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input type="datetime-local" value={nextRunAtInput || toDateTimeLocalValue(task.nextRunAt)} onChange={(event) => setNextRunAtInput(event.target.value)} />
                <Button variant="outline" onClick={() => {
                  if (nextRunAtInput.trim().length === 0) return
                  void scheduleTask(new Date(nextRunAtInput).toISOString(), 'Scheduled for custom time')
                }}>Schedule</Button>
                {task.status === 'scheduled' && <Button variant="ghost" onClick={() => void unscheduleTask()}>Cancel scheduled</Button>}
              </div>
            </div>
          </Section>

          <Section title="Recurring">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Repeat2 className="h-4 w-4 text-brand" />
                <span>{task.cronSchedule ? 'Recurring task enabled' : 'No recurrence configured'}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Input value={cronScheduleInput} onChange={(event) => setCronScheduleInput(event.target.value)} placeholder="0 9 * * 1-5" />
                <Button variant="outline" onClick={() => void saveRecurringSchedule()}>Save recurrence</Button>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-text-tertiary">
                <span>Next run: {task.nextRunAt ? formatTimestamp(task.nextRunAt) : '—'}</span>
                <span>Run history: {recurringRunCount}</span>
              </div>
            </div>
          </Section>

          <Section title="Comments">
            <div className="space-y-3">
              {commentsLoading ? (
                <EmptyCopy>Loading comments…</EmptyCopy>
              ) : comments.length > 0 ? (
                <div className="space-y-3">
                  {comments.map((comment) => (
                    <div key={`${comment.author}-${comment.timestamp}`} className="rounded-lg border border-border bg-surface-secondary p-3">
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-xs font-semibold text-text-primary">
                            {isAgentComment(comment.author) ? <Bot className="h-3.5 w-3.5 text-brand" /> : readInitials(comment.author)}
                          </span>
                          <span className="font-medium text-text-primary">{comment.author}</span>
                        </div>
                        <span className="text-xs text-text-tertiary" title={formatTimestamp(comment.timestamp)}>{formatRelativeTimestamp(comment.timestamp)}</span>
                      </div>
                      <p className="text-sm leading-6 text-text-primary">{comment.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyCopy>No comments yet. Be the first to add context.</EmptyCopy>
              )}

              <div className="space-y-3 rounded-lg border border-border bg-surface-secondary p-3">
                <Textarea
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  rows={3}
                  placeholder="Add a task comment or coordination note"
                />
                <div className="flex items-center justify-between gap-3">
                  {commentsError ? <p className="text-sm text-status-blocked">{commentsError}</p> : <span />}
                  <Button type="button" onClick={() => void submitComment()} disabled={commentsSaving || commentBody.trim().length === 0}>
                    {commentsSaving ? 'Posting…' : 'Add comment'}
                  </Button>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Approval">
            <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                <span className={clsx('rounded-sm border px-2 py-1 text-[11px] font-bold uppercase tracking-wider', approvalClasses[task.approvalOutcome ?? 'pending'])}>
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
                <div className="rounded-lg border border-status-waiting/20 bg-brand-muted p-3 text-sm text-text-primary">
                  {task.approvalReason}
                </div>
              ) : <EmptyCopy>No approval note recorded yet.</EmptyCopy>}

              {task.status === 'waiting-approval' && (
                <div className="space-y-3 rounded-lg border border-border bg-surface-secondary p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-status-waiting">
                    <Clock3 className="w-4 h-4" />
                    Waiting for approval
                  </div>
                  <Textarea value={rejectReason} onChange={event => setRejectReason(event.target.value)} rows={3} placeholder="Reason for rejection" />
                  <div className="flex gap-2">
                    <Button onClick={() => void approveTask(task.id)} disabled={isMutating} className="flex-1 bg-status-done text-white hover:bg-status-done/90 disabled:opacity-60">
                      Approve
                    </Button>
                    <Button onClick={() => void rejectTask(task.id, rejectReason || task.approvalReason || 'Rejected from detail panel')} disabled={isMutating} className="flex-1 bg-status-blocked text-white hover:bg-status-blocked/90 disabled:opacity-60">
                      Reject
                    </Button>
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

          <Section title="History">
            {taskHistory.length > 0 ? (
              <div className="space-y-3">
                {taskHistory.map((entry) => (
                  <div key={`${entry.at}-${entry.action}-${entry.actor}`} className="rounded-lg border border-border bg-surface-secondary p-3">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="font-medium text-text-primary">{formatHistoryLabel(entry)}</span>
                      <span className="text-xs text-text-tertiary" title={formatTimestamp(entry.at)}>{formatRelativeTimestamp(entry.at)}</span>
                    </div>
                    {(entry.fromStatus || entry.toStatus) && (
                      <div className="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                        {(entry.fromStatus || 'unknown')} → {(entry.toStatus || 'unknown')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : <EmptyCopy>No task history recorded yet.</EmptyCopy>}
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

        </div>
      </div>

      <div className="mt-auto border-t border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {tags.length > 0 ? tags.map(tag => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          )) : <span className="text-xs text-text-tertiary">No tags</span>}
        </div>
        {mode === 'preview' ? (
          <button type="button" onClick={() => navigate(`/tasks/${task.id}`)} className="inline-flex items-center gap-1 text-sm font-medium text-brand transition-colors hover:text-brand-dark">
            Open full record <ExternalLink className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-sm text-text-tertiary">Full task record</span>
        )}
      </div>
    </div>
  )
}
