import { useEffect, useMemo, useState } from 'react'
import { Clock3, Play, Plus, Repeat2, Search } from 'lucide-react'

import { relayhqApi } from '../api/client'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { getTaskDispatchSummary } from '../lib/taskPresentation'
import { cn } from '../lib/utils'
import { useAppStore } from '../store/appStore'
import type { Task } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

type ScheduleView = 'upcoming' | 'blocked'
type RangePreset = 'today' | 'this-week' | 'next-7-days' | 'all'
type ScheduleType = 'all' | 'one-time' | 'recurring'

type SchedulerFilters = {
  assigneeId: string
  scheduleType: ScheduleType
  rangePreset: RangePreset
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RANGE_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  'this-week': 'This week',
  'next-7-days': 'Next 7 days',
  all: 'All',
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const DAY_FORMATTER = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })

function isValidTimestamp(value?: string | null): value is string {
  return Boolean(value) && !Number.isNaN(new Date(value!).getTime())
}

function formatTime(value?: string | null) {
  if (!value || !isValidTimestamp(value)) return '—'
  return TIME_FORMATTER.format(new Date(value))
}

function formatTimestamp(value?: string | null) {
  if (!value || !isValidTimestamp(value)) return '—'
  const d = new Date(value)
  return `${DAY_FORMATTER.format(d)} ${TIME_FORMATTER.format(d)}`
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value || !isValidTimestamp(value)) return ''
  const d = new Date(value)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function buildTomorrowNineLocalValue() {
  const next = new Date()
  next.setDate(next.getDate() + 1)
  next.setHours(9, 0, 0, 0)
  return toDateTimeLocalValue(next.toISOString())
}

function formatGroupLabel(value?: string | null) {
  if (!value) return 'Unscheduled'
  const runAt = new Date(value)
  if (Number.isNaN(runAt.getTime())) return value
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const runDay = new Date(runAt); runDay.setHours(0, 0, 0, 0)
  const offset = Math.round((runDay.getTime() - today.getTime()) / 86_400_000)
  const label = DAY_FORMATTER.format(runAt)
  if (offset < 0) return `Overdue · ${label}`
  if (offset === 0) return `Today · ${label}`
  if (offset === 1) return `Tomorrow · ${label}`
  return label
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScheduleType(task: Task): Exclude<ScheduleType, 'all'> {
  return task.cronSchedule ? 'recurring' : 'one-time'
}

function isTaskInRange(task: Task, range: RangePreset) {
  if (range === 'all') return true
  if (!task.nextRunAt) return false
  const runAt = new Date(task.nextRunAt)
  if (Number.isNaN(runAt.getTime())) return false
  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  if (range === 'today') {
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1)
    return runAt >= todayStart && runAt < todayEnd
  }
  if (range === 'this-week') {
    const weekStart = new Date(todayStart)
    const day = weekStart.getDay()
    weekStart.setDate(weekStart.getDate() + (day === 0 ? -6 : 1 - day))
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7)
    return runAt >= weekStart && runAt < weekEnd
  }
  const next7 = new Date(todayStart); next7.setDate(next7.getDate() + 7)
  return runAt >= todayStart && runAt < next7
}

function normalizeDispatchState(task: Task) {
  if (task.status === 'waiting-approval') return 'blocked'
  if (task.dispatchStatus === 'blocked') return 'blocked'
  if (task.dispatchStatus === 'failed') return 'failed'
  if (task.dispatchStatus === 'ready') return 'ready'
  if (task.dispatchStatus === 'started') return 'queued'
  if (task.dispatchStatus === 'checking') return 'queued'
  if (task.status === 'blocked') return 'blocked'
  return 'queued'
}

function getBlockReason(task: Task) {
  if (task.status === 'waiting-approval') return task.approvalReason ?? 'Approval required before this task can run.'
  return task.blockedReason ?? task.dispatchReason ?? 'Waiting for scheduler handoff.'
}

function matchesFilters(task: Task, filters: SchedulerFilters, selectedProjectId: string | null) {
  if (selectedProjectId && task.projectId !== selectedProjectId) return false
  if (filters.assigneeId && (task.assigneeId ?? '') !== filters.assigneeId) return false
  if (filters.scheduleType !== 'all' && getScheduleType(task) !== filters.scheduleType) return false
  if (!isTaskInRange(task, filters.rangePreset)) return false
  return true
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TaskRow({
  task,
  isSelected,
  projectName,
  agentName,
  onSelect,
}: {
  key?: string
  task: Task
  isSelected: boolean
  projectName: string
  agentName: string
  onSelect: (id: string) => void
}) {
  const isRecurring = Boolean(task.cronSchedule)
  const dispatchState = normalizeDispatchState(task)
  const hasIssue = dispatchState === 'blocked' || dispatchState === 'failed'

  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className={cn(
        'flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors border-l-2 hover:bg-surface-secondary/40',
        isSelected ? 'border-l-brand bg-surface-secondary/50' : 'border-l-transparent',
      )}
    >
      {/* Time column */}
      <div className="w-12 flex-none text-right">
        <span className={cn('font-mono text-xs font-medium', hasIssue ? 'text-status-blocked' : 'text-text-secondary')}>
          {formatTime(task.nextRunAt)}
        </span>
      </div>

      <div className="mt-px h-3 w-px flex-none bg-border" />

      {/* Content */}
      <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-primary">{task.title}</div>
          <div className="mt-0.5 truncate text-xs text-text-tertiary">
            {projectName} · {agentName}
          </div>
        </div>
        <div className="flex flex-none items-center gap-1.5 pt-0.5">
          {isRecurring && <Repeat2 className="h-3 w-3 text-brand/50" />}
          {hasIssue && (
            <span className="rounded-full bg-status-blocked/15 px-1.5 py-0.5 text-[10px] text-status-blocked">
              {dispatchState}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function BlockedTaskRow({
  task,
  isSelected,
  projectName,
  agentName,
  onSelect,
}: {
  key?: string
  task: Task
  isSelected: boolean
  projectName: string
  agentName: string
  onSelect: (id: string) => void
}) {
  const dispatchState = normalizeDispatchState(task)
  const reason = getBlockReason(task)
  const isWaiting = task.status === 'waiting-approval'

  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className={cn(
        'flex w-full flex-col gap-2 border-b border-border px-4 py-3 text-left transition-colors border-l-2 hover:bg-surface-secondary/40',
        isSelected ? 'border-l-brand bg-surface-secondary/50' : 'border-l-transparent',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-primary">{task.title}</div>
          <div className="mt-0.5 text-xs text-text-tertiary">{projectName} · {agentName}</div>
        </div>
        <span className={cn(
          'flex-none rounded-full border px-2 py-0.5 text-[10px]',
          isWaiting
            ? 'border-status-waiting/30 bg-status-waiting/10 text-status-waiting'
            : 'border-status-blocked/30 bg-status-blocked/10 text-status-blocked',
        )}>
          {isWaiting ? 'awaiting approval' : dispatchState}
        </span>
      </div>
      <p className="text-xs text-text-secondary">{reason}</p>
    </button>
  )
}

function DetailPanel({
  task,
  projectName,
  agentName,
  hasAssignee,
  rescheduleInput,
  onRescheduleInputChange,
  schedulerAction,
  schedulerError,
  onRunNow,
  onReschedule,
}: {
  task: Task
  projectName: string
  agentName: string
  hasAssignee: boolean
  rescheduleInput: string
  onRescheduleInputChange: (value: string) => void
  schedulerAction: 'run-now' | 'reschedule' | null
  schedulerError: string | null
  onRunNow: () => void
  onReschedule: () => void
}) {
  const scheduleType = getScheduleType(task)
  const dispatchSummary = getTaskDispatchSummary(task)

  return (
    <div className="space-y-0 divide-y divide-border">
      {/* Task summary */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-primary leading-snug">{task.title}</h2>
          {scheduleType === 'recurring' && <Repeat2 className="mt-0.5 h-3.5 w-3.5 flex-none text-brand/60" />}
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-text-tertiary">Next run</span>
            <span className="font-medium text-text-primary text-right">{formatTimestamp(task.nextRunAt)}</span>
          </div>
          {task.cronSchedule && (
            <div className="flex justify-between gap-3">
              <span className="text-text-tertiary">Recurrence</span>
              <span className="font-mono text-xs text-text-secondary text-right">{task.cronSchedule}</span>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <span className="text-text-tertiary">Project</span>
            <span className="text-text-primary text-right truncate">{projectName}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-text-tertiary">Agent</span>
            <span className="text-text-primary text-right truncate">{agentName}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-text-tertiary">Status</span>
            <span className="text-text-primary text-right">{task.status}</span>
          </div>
        </div>

        {dispatchSummary && (
          <div className="rounded border border-border bg-surface-secondary px-3 py-2 text-xs text-text-secondary">
            <span className="font-medium text-text-primary">{dispatchSummary.label}: </span>
            {dispatchSummary.message}
          </div>
        )}
      </div>

      {/* Reschedule */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-tertiary">Reschedule</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onReschedule}
            disabled={schedulerAction !== null}
          >
            {schedulerAction === 'reschedule' ? 'Saving…' : 'Save'}
          </Button>
        </div>
        <Input
          type="datetime-local"
          value={rescheduleInput}
          onChange={e => onRescheduleInputChange(e.target.value)}
          aria-label="New run time"
        />
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ['In 1h', () => onRescheduleInputChange(toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000).toISOString()))],
            ['In 4h', () => onRescheduleInputChange(toDateTimeLocalValue(new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()))],
            ['Tomorrow 9am', () => onRescheduleInputChange(buildTomorrowNineLocalValue())],
          ] as [string, () => void][]).map(([label, handler]) => (
            <Button key={label} type="button" variant="ghost" size="sm" onClick={handler} className="text-xs">
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Run Now */}
      <div className="p-4 space-y-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-tertiary">Run Now</span>
        <p className="text-xs text-text-secondary">Clear the scheduled hold and launch this task immediately.</p>
        <Button
          type="button"
          className="w-full justify-center"
          onClick={onRunNow}
          disabled={schedulerAction !== null || !hasAssignee}
        >
          <Play className="h-3.5 w-3.5" />
          {schedulerAction === 'run-now' ? 'Launching…' : hasAssignee ? `Run with ${agentName}` : 'Assign agent first'}
        </Button>
      </div>

      {/* Error */}
      {schedulerError && (
        <div className="mx-4 mb-4 rounded border border-status-blocked/25 bg-status-blocked/10 px-3 py-2 text-sm text-status-blocked">
          {schedulerError}
        </div>
      )}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function SchedulerView() {
  const tasks = useAppStore(state => state.tasks)
  const projects = useAppStore(state => state.projects)
  const agents = useAppStore(state => state.agents)
  const selectedProjectId = useAppStore(state => state.selectedProjectId)
  const openNewScheduledTaskModal = useAppStore(state => state.openNewScheduledTaskModal)
  const fetchReadModel = useAppStore(state => state.fetchReadModel)

  const [view, setView] = useState<ScheduleView>('upcoming')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [rescheduleInput, setRescheduleInput] = useState('')
  const [schedulerAction, setSchedulerAction] = useState<'run-now' | 'reschedule' | null>(null)
  const [schedulerError, setSchedulerError] = useState<string | null>(null)
  const [filters, setFilters] = useState<SchedulerFilters>({
    assigneeId: '',
    scheduleType: 'all',
    rangePreset: 'next-7-days',
  })

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local', [])
  const projectNames = useMemo(() => new Map(projects.map(p => [p.id, p.name])), [projects])
  const agentNames = useMemo(() => new Map(agents.map(a => [a.id, a.name])), [agents])

  const scheduledTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return tasks
      .filter(t => t.status === 'scheduled' || Boolean(t.nextRunAt) || Boolean(t.cronSchedule))
      .filter(t => !q || t.title.toLowerCase().includes(q))
      .filter(t => matchesFilters(t, filters, selectedProjectId))
      .sort((a, b) => {
        const aHas = isValidTimestamp(a.nextRunAt)
        const bHas = isValidTimestamp(b.nextRunAt)
        if (aHas && bHas) return new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime()
        if (aHas) return -1
        if (bHas) return 1
        return a.title.localeCompare(b.title)
      })
  }, [filters, searchQuery, selectedProjectId, tasks])

  const agendaGroups = useMemo(() => {
    const groups = new Map<string, Task[]>()
    for (const t of scheduledTasks) {
      const key = formatGroupLabel(t.nextRunAt)
      const curr = groups.get(key)
      if (curr) curr.push(t)
      else groups.set(key, [t])
    }
    return [...groups.entries()]
  }, [scheduledTasks])

  const needsAttentionTasks = useMemo(
    () =>
      scheduledTasks.filter(t => {
        const dispatch = normalizeDispatchState(t)
        return dispatch === 'blocked' || dispatch === 'failed' || t.status === 'waiting-approval'
      }),
    [scheduledTasks],
  )

  // Auto-select first task
  useEffect(() => {
    if (scheduledTasks.length === 0) { setSelectedTaskId(null); return }
    if (!selectedTaskId || !scheduledTasks.some(t => t.id === selectedTaskId)) {
      setSelectedTaskId(scheduledTasks[0]?.id ?? null)
    }
  }, [scheduledTasks, selectedTaskId])

  const selectedTask = scheduledTasks.find(t => t.id === selectedTaskId) ?? null
  const selectedProjectName = selectedTask ? (projectNames.get(selectedTask.projectId) ?? selectedTask.projectId) : ''
  const selectedAgentName = selectedTask
    ? (agentNames.get(selectedTask.assigneeId ?? '') ?? selectedTask.assigneeId ?? 'Unassigned')
    : 'Unassigned'
  const selectedTaskHasAssignee = Boolean(selectedTask?.assigneeId && selectedTask.assigneeId !== 'unassigned')

  useEffect(() => {
    setRescheduleInput(toDateTimeLocalValue(selectedTask?.nextRunAt))
    setSchedulerError(null)
  }, [selectedTask?.id, selectedTask?.nextRunAt])

  async function handleRunNow() {
    if (!selectedTask) return
    if (!selectedTask.assigneeId || selectedTask.assigneeId === 'unassigned') {
      setSchedulerError('Assign an agent before launching this task.')
      return
    }
    setSchedulerAction('run-now')
    setSchedulerError(null)
    try {
      await relayhqApi.patchTask(selectedTask.id, {
        actorId: 'relayhq-web',
        patch: { status: 'todo', column: 'todo', next_run_at: null, blocked_reason: null, blocked_since: null },
      })
      await relayhqApi.runAgent(selectedTask.assigneeId, { taskId: selectedTask.id, surface: 'background' })
      await fetchReadModel()
    } catch (error) {
      setSchedulerError(error instanceof Error ? error.message : 'Unable to launch task.')
    } finally {
      setSchedulerAction(null)
    }
  }

  async function handleReschedule() {
    if (!selectedTask) return
    if (!rescheduleInput.trim()) { setSchedulerError('Choose a new run time.'); return }
    const nextRunAt = new Date(rescheduleInput)
    if (Number.isNaN(nextRunAt.getTime())) { setSchedulerError('Enter a valid run time.'); return }
    setSchedulerAction('reschedule')
    setSchedulerError(null)
    try {
      await relayhqApi.scheduleTask(selectedTask.id, {
        actorId: 'relayhq-web',
        nextRunAt: nextRunAt.toISOString(),
        reason: selectedTask.cronSchedule
          ? 'Recurring schedule adjusted from Scheduler.'
          : 'Scheduled task moved from Scheduler.',
      })
      await fetchReadModel()
    } catch (error) {
      setSchedulerError(error instanceof Error ? error.message : 'Unable to reschedule task.')
    } finally {
      setSchedulerAction(null)
    }
  }

  const displayedTasks = view === 'upcoming' ? null : needsAttentionTasks

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* ── Header ── */}
      <div className="flex flex-none flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Schedule</h1>
          <p className="text-xs text-text-tertiary">
            {scheduledTasks.length} task{scheduledTasks.length !== 1 ? 's' : ''} · {timezone}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Range selector */}
          <div className="flex rounded border border-border bg-surface-secondary p-0.5 gap-0.5">
            {(['today', 'this-week', 'next-7-days', 'all'] as const).map(range => (
              <button
                key={range}
                type="button"
                onClick={() => setFilters(c => ({ ...c, rangePreset: range }))}
                className={cn(
                  'rounded px-2.5 py-1 text-xs transition-colors',
                  filters.rangePreset === range
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-tertiary hover:text-text-secondary',
                )}
              >
                {RANGE_LABELS[range]}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="h-8 w-40 pl-8 text-sm"
            />
          </div>

          <Button type="button" size="sm" onClick={openNewScheduledTaskModal}>
            <Plus className="h-3.5 w-3.5" /> New Scheduled Task
          </Button>
        </div>
      </div>

      {/* ── Filter strip ── */}
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border bg-surface-secondary/30 px-4 py-2">
        <Select
          value={filters.assigneeId}
          onChange={e => setFilters(c => ({ ...c, assigneeId: e.target.value }))}
          className="h-10 min-w-40 text-sm"
        >
          <option value="">All agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>

        <div className="flex gap-1">
          {(['all', 'one-time', 'recurring'] as const).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setFilters(c => ({ ...c, scheduleType: type }))}
              className={cn(
                'inline-flex h-10 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors',
                filters.scheduleType === type
                  ? 'border-brand/30 bg-brand/10 text-brand'
                  : 'border-border text-text-tertiary hover:text-text-secondary',
              )}
            >
              {type === 'all' ? 'All' : type === 'one-time' ? 'One-time' : (
                <span className="flex items-center gap-1">
                  <Repeat2 className="h-3.5 w-3.5" /> Recurring
                </span>
              )}
            </button>
          ))}
        </div>

        {(filters.assigneeId || filters.scheduleType !== 'all') && (
          <button
            type="button"
            onClick={() => setFilters(c => ({ ...c, assigneeId: '', scheduleType: 'all' }))}
            className="text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Task list */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-border">
          {/* View switcher */}
          <div className="flex flex-none border-b border-border px-4">
            <button
              type="button"
              onClick={() => setView('upcoming')}
              className={cn(
                'mr-5 border-b-2 py-2.5 text-sm transition-colors',
                view === 'upcoming'
                  ? 'border-brand font-medium text-text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary',
              )}
            >
              Upcoming
            </button>
            <button
              type="button"
              onClick={() => setView('blocked')}
              className={cn(
                'flex items-center gap-1.5 border-b-2 py-2.5 text-sm transition-colors',
                view === 'blocked'
                  ? 'border-brand font-medium text-text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary',
              )}
            >
              Needs Attention
              {needsAttentionTasks.length > 0 && (
                <span className="rounded-full bg-status-blocked/15 px-1.5 py-0.5 text-[10px] text-status-blocked">
                  {needsAttentionTasks.length}
                </span>
              )}
            </button>
          </div>

          {/* Task list content */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {view === 'upcoming' ? (
              agendaGroups.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center">
                  <div className="text-center">
                    <Clock3 className="mx-auto mb-2 h-6 w-6 text-text-tertiary" />
                    <p className="text-sm text-text-tertiary">No scheduled tasks in this range.</p>
                    <button type="button" onClick={openNewScheduledTaskModal} className="mt-2 text-xs text-brand hover:underline">
                      Create a scheduled task
                    </button>
                  </div>
                </div>
              ) : (
                agendaGroups.map(([label, groupTasks]) => (
                  <section key={label}>
                    <div className="flex items-center justify-between border-b border-border bg-surface-secondary/40 px-4 py-2">
                      <span className="text-xs font-medium text-text-secondary">{label}</span>
                      <span className="text-xs text-text-tertiary">{groupTasks.length}</span>
                    </div>
                    {groupTasks.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        isSelected={task.id === selectedTaskId}
                        projectName={projectNames.get(task.projectId) ?? task.projectId}
                        agentName={agentNames.get(task.assigneeId ?? '') ?? task.assigneeId ?? 'Unassigned'}
                        onSelect={setSelectedTaskId}
                      />
                    ))}
                  </section>
                ))
              )
            ) : (
              displayedTasks!.length === 0 ? (
                <div className="flex min-h-40 items-center justify-center">
                  <p className="text-sm text-text-tertiary">All scheduled tasks look healthy.</p>
                </div>
              ) : (
                displayedTasks!.map(task => (
                  <BlockedTaskRow
                    key={task.id}
                    task={task}
                    isSelected={task.id === selectedTaskId}
                    projectName={projectNames.get(task.projectId) ?? task.projectId}
                    agentName={agentNames.get(task.assigneeId ?? '') ?? task.assigneeId ?? 'Unassigned'}
                    onSelect={setSelectedTaskId}
                  />
                ))
              )
            )}
          </div>
        </div>

        {/* Right: Detail panel */}
        <div className="w-80 flex-none overflow-y-auto">
          {selectedTask ? (
            <DetailPanel
              task={selectedTask}
              projectName={selectedProjectName}
              agentName={selectedAgentName}
              hasAssignee={selectedTaskHasAssignee}
              rescheduleInput={rescheduleInput}
              onRescheduleInputChange={setRescheduleInput}
              schedulerAction={schedulerAction}
              schedulerError={schedulerError}
              onRunNow={() => void handleRunNow()}
              onReschedule={() => void handleReschedule()}
            />
          ) : (
            <div className="flex min-h-40 items-center justify-center px-6 text-center">
              <p className="text-sm text-text-tertiary">Select a task to view details and reschedule options.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
