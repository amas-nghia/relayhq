import { useMemo } from 'react'
import { Bot, CheckCircle2, Clock3, Plus, TriangleAlert, User2, X } from 'lucide-react'

import { useAppStore } from '../store/appStore'
import type { ReadModelAuditNote } from '../api/contract'

type AuditKind = 'claimed' | 'approved' | 'rejected' | 'completed' | 'created' | 'blocked' | 'requested-approval'

function deriveKind(note: ReadModelAuditNote): AuditKind {
  const text = `${note.source} ${note.message}`.toLowerCase()
  if (text.includes('request')) return 'requested-approval'
  if (text.includes('reject')) return 'rejected'
  if (text.includes('approved')) return 'approved'
  if (text.includes('claim')) return 'claimed'
  if (text.includes('block')) return 'blocked'
  if (text.includes('complete') || text.includes('coverage') || text.includes('seed')) return 'completed'
  return 'created'
}

function iconFor(kind: AuditKind) {
  switch (kind) {
    case 'claimed':
      return <Bot className="h-3.5 w-3.5 text-brand" />
    case 'approved':
    case 'completed':
      return <CheckCircle2 className="h-3.5 w-3.5 text-status-done" />
    case 'rejected':
    case 'blocked':
      return <X className="h-3.5 w-3.5 text-status-blocked" />
    case 'requested-approval':
      return <Clock3 className="h-3.5 w-3.5 text-status-waiting" />
    default:
      return <Plus className="h-3.5 w-3.5 text-text-tertiary" />
  }
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
  const auditNotes = useAppStore(state => state.auditNotes)
  const openDetail = useAppStore(state => state.openTaskDetail)

  const groups = useMemo(() => {
    const notes = [...auditNotes].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    const grouped = new Map<string, ReadModelAuditNote[]>()

    for (const note of notes) {
      const label = formatGroupLabel(new Date(note.createdAt))
      const bucket = grouped.get(label) ?? []
      bucket.push(note)
      grouped.set(label, bucket)
    }

    return [...grouped.entries()].map(([label, rows]) => ({ label, rows }))
  }, [auditNotes])

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
              {group.rows.map(note => {
                const kind = deriveKind(note)
                const isUser = !note.source.startsWith('agent-')

                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => note.taskId && openDetail(note.taskId)}
                    className="relative text-left"
                    disabled={!note.taskId}
                  >
                    <div className="absolute -left-[27px] top-1 rounded-full border-2 border-border bg-surface p-0.5">
                      {iconFor(kind)}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                      <span className="w-16 shrink-0 pt-0.5 text-sm font-semibold text-text-tertiary">
                        {formatTime(note.createdAt)}
                      </span>
                      <div className="flex flex-1 flex-col gap-1">
                        <div className="text-sm">
                          <span className={isUser ? 'inline-flex items-center gap-1 font-semibold text-status-done' : 'font-semibold text-text-primary'}>
                            {isUser ? <User2 className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                            {note.source}
                          </span>{' '}
                          <span className="text-text-secondary">{note.message}</span>
                          {note.taskId && <span className="font-medium text-text-primary"> {note.taskId}</span>}
                        </div>
                        <div className="max-w-3xl rounded border border-border/50 bg-surface-secondary p-2 text-sm text-text-secondary/80">
                          {note.sourcePath}
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
