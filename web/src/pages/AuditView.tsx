import { useMemo } from 'react'
import { AlertTriangle, Bot, CheckCircle2, Clock3, Plus, User2 } from 'lucide-react'

import { useAppStore } from '../store/appStore'
type TaskActivityKind = 'created' | 'claimed' | 'done' | 'blocked' | 'waiting-approval'

type TaskActivityEvent = {
  id: string
  taskId: string
  title: string
  actor: string
  timestamp: string
  kind: TaskActivityKind
}

function iconFor(kind: TaskActivityKind) {
  switch (kind) {
    case 'claimed':
      return <Bot className="h-3.5 w-3.5 text-brand" />
    case 'done':
      return <CheckCircle2 className="h-3.5 w-3.5 text-status-done" />
    case 'blocked':
      return <AlertTriangle className="h-3.5 w-3.5 text-status-blocked" />
    case 'waiting-approval':
      return <Clock3 className="h-3.5 w-3.5 text-status-waiting" />
    default:
      return <Plus className="h-3.5 w-3.5 text-text-tertiary" />
  }
}

function actionLabel(kind: TaskActivityKind): string {
  if (kind === 'created') return 'created task'
  if (kind === 'claimed') return 'claimed task'
  if (kind === 'blocked') return 'blocked task'
  if (kind === 'waiting-approval') return 'requested approval for'
  return 'completed task'
}

function formatGroupLabel(date: Date): string {
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)

  const value = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  if (value.getTime() === startOfToday.getTime()) return 'TODAY'
  if (value.getTime() === startOfYesterday.getTime()) return 'YESTERDAY'
  return date.toLocaleDateString()
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function AuditView() {
  const tasks = useAppStore(state => state.tasks)
  const openDetail = useAppStore(state => state.openTaskDetail)

  const groups = useMemo(() => {
    const events: TaskActivityEvent[] = tasks.flatMap((task) => {
      const rows: TaskActivityEvent[] = []
      if (task.createdAt && task.createdBy) {
        rows.push({
          id: `${task.id}-created`,
          taskId: task.id,
          title: task.title,
          actor: task.createdBy,
          timestamp: task.createdAt,
          kind: 'created',
        })
      }
      if (task.executionStartedAt && task.assigneeId) {
        rows.push({
          id: `${task.id}-claimed`,
          taskId: task.id,
          title: task.title,
          actor: task.assigneeId,
          timestamp: task.executionStartedAt,
          kind: 'claimed',
        })
      }
      if (task.blockedTime && task.assigneeId && task.status === 'blocked') {
        rows.push({
          id: `${task.id}-blocked`,
          taskId: task.id,
          title: task.title,
          actor: task.assigneeId,
          timestamp: task.updatedAt ?? task.createdAt ?? new Date().toISOString(),
          kind: 'blocked',
        })
      }
      if (task.requestedApprovalTime && task.assigneeId && task.status === 'waiting-approval') {
        rows.push({
          id: `${task.id}-waiting-approval`,
          taskId: task.id,
          title: task.title,
          actor: task.assigneeId,
          timestamp: task.updatedAt ?? task.createdAt ?? new Date().toISOString(),
          kind: 'waiting-approval',
        })
      }
      if (task.completedAt && task.assigneeId) {
        rows.push({
          id: `${task.id}-done`,
          taskId: task.id,
          title: task.title,
          actor: task.assigneeId,
          timestamp: task.completedAt,
          kind: 'done',
        })
      }
      return rows
    }).sort((left, right) => right.timestamp.localeCompare(left.timestamp))

    const grouped = new Map<string, TaskActivityEvent[]>()

    for (const event of events) {
      const label = formatGroupLabel(new Date(event.timestamp))
      const bucket = grouped.get(label) ?? []
      bucket.push(event)
      grouped.set(label, bucket)
    }

    return [...grouped.entries()].map(([label, rows]) => ({ label, rows }))
  }, [tasks])

  return (
    <div className="flex min-h-full w-full flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-text-primary">Audit Trail</h1>
        <span className="text-text-tertiary">—</span>
        <span className="text-sm font-medium text-text-secondary">Live vault-backed timeline</span>
      </div>

      <div className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-6">
        {groups.map(group => (
          <div key={group.label} className="flex flex-col gap-4">
            <h3 className="pl-4 text-xs font-bold uppercase tracking-wider text-text-tertiary">{group.label}</h3>
            <div className="relative ml-5 flex flex-col gap-5 border-l-2 border-border pl-5">
              {group.rows.map(event => {
                const isUser = !event.actor.startsWith('agent-')

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => event.taskId && openDetail(event.taskId)}
                    className="relative text-left"
                    disabled={!event.taskId}
                  >
                    <div className="absolute -left-[27px] top-1 rounded-full border-2 border-border bg-surface p-0.5">
                      {iconFor(event.kind)}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                      <span className="w-16 shrink-0 pt-0.5 text-sm font-semibold text-text-tertiary">
                        {formatTime(event.timestamp)}
                      </span>
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="text-sm">
                          <span className={isUser ? 'inline-flex items-center gap-1 font-semibold text-status-done' : 'font-semibold text-text-primary'}>
                            {isUser ? <User2 className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                            {event.actor}
                          </span>{' '}
                          <span className="text-text-secondary">{actionLabel(event.kind)}</span>
                          <span className="font-medium text-text-primary"> {event.title}</span>
                        </div>
                        <div className="max-w-3xl rounded border border-border/50 bg-surface-secondary p-2 text-sm text-text-secondary/80">
                          {event.taskId}
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
  )
}
