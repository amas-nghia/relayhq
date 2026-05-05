import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Clock3, ExternalLink, ListFilter, Play, Plus, Repeat2, Search } from 'lucide-react'
import { Link } from 'react-router-dom'

import { relayhqApi } from '../api/client'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { getTaskDispatchSummary } from '../lib/taskPresentation'
import { cn } from '../lib/utils'
import { useAppStore } from '../store/appStore'
import type { Task } from '../types'

type SchedulerTab = 'agenda' | 'queue' | 'recurring' | 'calendar'
type RangePreset = 'today' | 'this-week' | 'next-7-days' | 'all'
type ScheduleType = 'all' | 'one-time' | 'recurring'

type SchedulerFilters = {
  projectId: string
  assigneeId: string
  status: string
  scheduleType: ScheduleType
  dispatchState: string
  rangePreset: RangePreset
}

const TAB_LABELS: Record<SchedulerTab, string> = {
  agenda: 'Agenda',
  queue: 'Queue',
  recurring: 'Recurring',
  calendar: 'Calendar',
}

const RANGE_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  'this-week': 'This Week',
  'next-7-days': 'Next 7 Days',
  all: 'All',
}

const DISPATCH_BADGE_CLASS: Record<string, string> = {
  ready: 'border-status-done/25 bg-status-done/10 text-status-done',
  queued: 'border-status-active/25 bg-status-active/10 text-status-active',
  checking: 'border-status-waiting/25 bg-status-waiting/10 text-status-waiting',
  started: 'border-status-active/25 bg-status-active/10 text-status-active',
  blocked: 'border-status-blocked/25 bg-status-blocked/10 text-status-blocked',
  failed: 'border-status-blocked/25 bg-status-blocked/10 text-status-blocked',
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  scheduled: 'border-border bg-surface-secondary text-text-secondary',
  todo: 'border-border bg-surface-secondary text-text-secondary',
  blocked: 'border-status-blocked/25 bg-status-blocked/10 text-status-blocked',
  'in-progress': 'border-status-active/25 bg-status-active/10 text-status-active',
  review: 'border-status-waiting/25 bg-status-waiting/10 text-status-waiting',
  'waiting-approval': 'border-status-waiting/25 bg-status-waiting/10 text-status-waiting',
}

const DAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
})

function isValidTimestamp(value?: string | null) {
  if (!value) return false
  return !Number.isNaN(new Date(value).getTime())
}

function formatRunTime(value?: string | null) {
  if (!value) return 'No run time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return TIME_FORMATTER.format(date)
}

function formatTimestamp(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${DAY_FORMATTER.format(date)} ${TIME_FORMATTER.format(date)}`
}

function toDateTimeLocalValue(value?: string | null) {
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

function buildTomorrowNineLocalValue() {
  const next = new Date()
  next.setDate(next.getDate() + 1)
  next.setHours(9, 0, 0, 0)
  return toDateTimeLocalValue(next.toISOString())
}

function formatAgendaGroupLabel(value?: string | null) {
  if (!value) return 'Unscheduled'

  const runAt = new Date(value)
  if (Number.isNaN(runAt.getTime())) return value

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const runDay = new Date(runAt)
  runDay.setHours(0, 0, 0, 0)

  const offsetDays = Math.round((runDay.getTime() - today.getTime()) / 86400000)
  const formattedDay = DAY_FORMATTER.format(runAt)

  if (offsetDays < 0) return `Overdue · ${formattedDay}`
  if (offsetDays === 0) return `Today · ${formattedDay}`
  if (offsetDays === 1) return `Tomorrow · ${formattedDay}`
  return formattedDay
}

function getQueueReason(task: Task) {
  if (task.status === 'waiting-approval' || (task.approvalNeeded && task.approvalOutcome !== 'approved')) {
    return task.approvalReason ?? 'Approval required before this scheduled task can run.'
  }

  return task.blockedReason ?? task.dispatchReason ?? 'Waiting for scheduler handoff.'
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

function getScheduleType(task: Task): Exclude<ScheduleType, 'all'> {
  return task.cronSchedule ? 'recurring' : 'one-time'
}

function isTaskInRange(task: Task, rangePreset: RangePreset) {
  if (rangePreset === 'all') return true
  if (!task.nextRunAt) return false

  const runAt = new Date(task.nextRunAt)
  if (Number.isNaN(runAt.getTime())) return false

  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  if (rangePreset === 'today') {
    const endOfToday = new Date(startOfToday)
    endOfToday.setDate(endOfToday.getDate() + 1)
    return runAt >= startOfToday && runAt < endOfToday
  }

  if (rangePreset === 'this-week') {
    const startOfWeek = new Date(startOfToday)
    const day = startOfWeek.getDay()
    const mondayOffset = day === 0 ? -6 : 1 - day
    startOfWeek.setDate(startOfWeek.getDate() + mondayOffset)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(endOfWeek.getDate() + 7)
    return runAt >= startOfWeek && runAt < endOfWeek
  }

  const nextSevenDays = new Date(startOfToday)
  nextSevenDays.setDate(nextSevenDays.getDate() + 7)
  return runAt >= startOfToday && runAt < nextSevenDays
}

function matchesSchedulerFilters(task: Task, filters: SchedulerFilters) {
  if (filters.projectId && task.projectId !== filters.projectId) return false
  if (filters.assigneeId && (task.assigneeId ?? '') !== filters.assigneeId) return false
  if (filters.status && task.status !== filters.status) return false
  if (filters.scheduleType !== 'all' && getScheduleType(task) !== filters.scheduleType) return false
  if (filters.dispatchState && normalizeDispatchState(task) !== filters.dispatchState) return false
  if (!isTaskInRange(task, filters.rangePreset)) return false
  return true
}

function SchedulerTaskRow({
  task,
  isSelected,
  projectName,
  agentName,
  onSelect,
  variant = 'agenda',
}: {
  key?: string
  task: Task
  isSelected: boolean
  projectName: string
  agentName: string
  onSelect: (taskId: string) => void
  variant?: 'agenda' | 'queue'
}) {
  const scheduleType = getScheduleType(task)
  const dispatchState = normalizeDispatchState(task)
  const queueReason = getQueueReason(task)

  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className={cn(
        'flex w-full flex-col gap-3 border-b border-border px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-brand-muted/20',
        isSelected && 'bg-brand-muted/25',
      )}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="min-w-[72px] border-r border-border pr-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">
            {formatRunTime(task.nextRunAt)}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="text-sm font-semibold uppercase tracking-[0.08em] text-text-primary">{task.title}</div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-text-tertiary">
              <span>Project {projectName}</span>
              <span>Agent {agentName}</span>
              <span>Next {formatTimestamp(task.nextRunAt)}</span>
              {task.cronSchedule && <span>Cron {task.cronSchedule}</span>}
            </div>
            {variant === 'queue' ? <div className="text-sm text-text-secondary">{queueReason}</div> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:max-w-[280px] xl:justify-end">
          <Badge variant="secondary" className="border-brand/15 bg-brand-muted text-brand">
            {scheduleType === 'recurring' ? <Repeat2 className="mr-1 h-3 w-3" /> : <Clock3 className="mr-1 h-3 w-3" />}
            {scheduleType === 'recurring' ? 'Recurring' : 'One-Time'}
          </Badge>
          <Badge variant="secondary" className={STATUS_BADGE_CLASS[task.status] ?? 'border-border bg-surface-secondary text-text-secondary'}>
            {task.status}
          </Badge>
          <Badge variant="secondary" className={DISPATCH_BADGE_CLASS[dispatchState] ?? 'border-border bg-surface-secondary text-text-secondary'}>
            {dispatchState}
          </Badge>
        </div>
      </div>
    </button>
  )
}

function SchedulerSectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between border-b border-accent px-4 py-3">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">{title}</div>
      </div>
      <Badge variant="secondary" className="border-brand/15 bg-brand-muted text-text-tertiary">{count}</Badge>
    </div>
  )
}

export function SchedulerView() {
  const tasks = useAppStore(state => state.tasks)
  const projects = useAppStore(state => state.projects)
  const agents = useAppStore(state => state.agents)
  const openNewTaskModal = useAppStore(state => state.openNewTaskModal)
  const fetchReadModel = useAppStore(state => state.fetchReadModel)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SchedulerTab>('agenda')
  const [rescheduleInput, setRescheduleInput] = useState('')
  const [schedulerAction, setSchedulerAction] = useState<'run-now' | 'reschedule' | null>(null)
  const [schedulerError, setSchedulerError] = useState<string | null>(null)
  const [filters, setFilters] = useState<SchedulerFilters>({
    projectId: '',
    assigneeId: '',
    status: '',
    scheduleType: 'all',
    dispatchState: '',
    rangePreset: 'next-7-days',
  })

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local', [])
  const projectNames = useMemo(() => new Map(projects.map(project => [project.id, project.name])), [projects])
  const agentNames = useMemo(() => new Map(agents.map(agent => [agent.id, agent.name])), [agents])

  const scheduledTasks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    return tasks
      .filter(task => task.status === 'scheduled' || Boolean(task.nextRunAt) || Boolean(task.cronSchedule))
      .filter(task => (normalizedQuery.length === 0 ? true : task.title.toLowerCase().includes(normalizedQuery)))
      .filter(task => matchesSchedulerFilters(task, filters))
      .sort((left, right) => {
        const leftHasRunAt = isValidTimestamp(left.nextRunAt)
        const rightHasRunAt = isValidTimestamp(right.nextRunAt)

        if (leftHasRunAt && rightHasRunAt) {
          return new Date(left.nextRunAt as string).getTime() - new Date(right.nextRunAt as string).getTime() || left.title.localeCompare(right.title)
        }

        if (leftHasRunAt) return -1
        if (rightHasRunAt) return 1
        return left.title.localeCompare(right.title)
      })
  }, [filters, searchQuery, tasks])

  const agendaGroups = useMemo(() => {
    const groups = new Map<string, Task[]>()

    for (const task of scheduledTasks) {
      const key = formatAgendaGroupLabel(task.nextRunAt)
      const current = groups.get(key)
      if (current) {
        current.push(task)
      } else {
        groups.set(key, [task])
      }
    }

    return [...groups.entries()]
  }, [scheduledTasks])

  const queueBuckets = useMemo(() => {
    return {
      queued: scheduledTasks.filter(task => normalizeDispatchState(task) === 'queued' && task.status !== 'in-progress'),
      blocked: scheduledTasks.filter(task => normalizeDispatchState(task) === 'blocked' && task.status !== 'in-progress'),
      failed: scheduledTasks.filter(task => normalizeDispatchState(task) === 'failed' && task.status !== 'in-progress'),
    }
  }, [scheduledTasks])

  const recurringTasks = useMemo(() => scheduledTasks.filter(task => Boolean(task.cronSchedule)), [scheduledTasks])

  useEffect(() => {
    if (scheduledTasks.length === 0) {
      setSelectedTaskId(null)
      return
    }

    if (!selectedTaskId || !scheduledTasks.some(task => task.id === selectedTaskId)) {
      setSelectedTaskId(scheduledTasks[0]?.id ?? null)
    }
  }, [scheduledTasks, selectedTaskId])

  const selectedTask = scheduledTasks.find(task => task.id === selectedTaskId) ?? null
  const selectedProjectName = selectedTask ? projects.find(project => project.id === selectedTask.projectId)?.name ?? selectedTask.projectId : 'No task selected'
  const selectedAgentName = selectedTask ? agents.find(agent => agent.id === selectedTask.assigneeId)?.name ?? selectedTask.assigneeId ?? 'Unassigned' : 'Select a scheduled task'
  const selectedDispatchSummary = selectedTask ? getTaskDispatchSummary(selectedTask) : null
  const selectedTaskHasAssignee = Boolean(selectedTask?.assigneeId && selectedTask.assigneeId !== 'unassigned')

  useEffect(() => {
    setRescheduleInput(toDateTimeLocalValue(selectedTask?.nextRunAt))
    setSchedulerError(null)
  }, [selectedTask?.id, selectedTask?.nextRunAt])

  async function handleRunNow() {
    if (!selectedTask) return
    if (!selectedTask.assigneeId || selectedTask.assigneeId === 'unassigned') {
      setSchedulerError('Assign an agent before launching a scheduled task.')
      return
    }

    setSchedulerAction('run-now')
    setSchedulerError(null)
    try {
      await relayhqApi.patchTask(selectedTask.id, {
        actorId: 'relayhq-web',
        patch: {
          status: 'todo',
          column: 'todo',
          next_run_at: null,
          blocked_reason: null,
          blocked_since: null,
        },
      })
      await relayhqApi.runAgent(selectedTask.assigneeId, { taskId: selectedTask.id, surface: 'background' })
      await fetchReadModel()
    } catch (error) {
      setSchedulerError(error instanceof Error ? error.message : 'Unable to launch the scheduled task.')
    } finally {
      setSchedulerAction(null)
    }
  }

  async function handleReschedule() {
    if (!selectedTask) return
    if (rescheduleInput.trim().length === 0) {
      setSchedulerError('Choose a new run time before rescheduling.')
      return
    }

    const nextRunAt = new Date(rescheduleInput)
    if (Number.isNaN(nextRunAt.getTime())) {
      setSchedulerError('Enter a valid run time.')
      return
    }

    setSchedulerAction('reschedule')
    setSchedulerError(null)
    try {
      await relayhqApi.scheduleTask(selectedTask.id, {
        actorId: 'relayhq-web',
        nextRunAt: nextRunAt.toISOString(),
        reason: selectedTask.cronSchedule ? 'Recurring schedule adjusted from Scheduler.' : 'Scheduled task moved from Scheduler.',
      })
      await fetchReadModel()
    } catch (error) {
      setSchedulerError(error instanceof Error ? error.message : 'Unable to reschedule task.')
    } finally {
      setSchedulerAction(null)
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden">
      <div className="grid shrink-0 gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
        <Card className="border-accent bg-surface-secondary p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
                  <CalendarClock className="h-4 w-4 text-brand" />
                  Planning Surface
                </div>
                <div>
                  <h1 className="text-2xl font-bold uppercase tracking-[0.08em] text-text-primary">Scheduler</h1>
                  <p className="text-sm text-text-secondary">Operational timeline for future work, recurrence, and launch readiness.</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[auto_auto] xl:min-w-[440px] xl:grid-cols-[auto_minmax(0,1fr)_auto]">
                <div className="flex items-center gap-2 border border-accent bg-surface p-1">
                  {(['today', 'this-week'] as const).map(range => (
                    <Button
                      key={range}
                      type="button"
                      variant={filters.rangePreset === range ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setFilters(current => ({ ...current, rangePreset: range }))}
                    >
                      {RANGE_LABELS[range]}
                    </Button>
                  ))}
                </div>

                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search scheduled tasks"
                    className="pl-9"
                  />
                </div>

                <Button type="button" onClick={openNewTaskModal} className="justify-center">
                  <Plus className="h-4 w-4" />
                  Create Task
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs uppercase tracking-[0.16em] text-text-tertiary">
              <span>Timezone: {timezone}</span>
              <span>{scheduledTasks.length} visible scheduled tasks</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        <Card className="min-h-0 overflow-hidden">
          <SchedulerSectionHeading title="Filters" count={scheduledTasks.length} />
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
              <ListFilter className="h-4 w-4" />
              Scope
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">Project</label>
              <Select value={filters.projectId} onChange={(event) => setFilters(current => ({ ...current, projectId: event.target.value }))}>
                <option value="">All projects</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">Agent</label>
              <Select value={filters.assigneeId} onChange={(event) => setFilters(current => ({ ...current, assigneeId: event.target.value }))}>
                <option value="">All agents</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">Status</label>
              <Select value={filters.status} onChange={(event) => setFilters(current => ({ ...current, status: event.target.value }))}>
                <option value="">All states</option>
                <option value="scheduled">Scheduled</option>
                <option value="todo">Todo</option>
                <option value="blocked">Blocked</option>
                <option value="in-progress">In progress</option>
                <option value="review">Review</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">Type</label>
              <Select value={filters.scheduleType} onChange={(event) => setFilters(current => ({ ...current, scheduleType: event.target.value as ScheduleType }))}>
                <option value="all">All types</option>
                <option value="one-time">One-time</option>
                <option value="recurring">Recurring</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">Dispatch</label>
              <Select value={filters.dispatchState} onChange={(event) => setFilters(current => ({ ...current, dispatchState: event.target.value }))}>
                <option value="">All states</option>
                <option value="queued">Queued</option>
                <option value="ready">Ready</option>
                <option value="blocked">Blocked</option>
                <option value="failed">Failed</option>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">Range</label>
              <Select value={filters.rangePreset} onChange={(event) => setFilters(current => ({ ...current, rangePreset: event.target.value as RangePreset }))}>
                <option value="today">Today</option>
                <option value="this-week">This week</option>
                <option value="next-7-days">Next 7 days</option>
                <option value="all">All</option>
              </Select>
            </div>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SchedulerTab)} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-border px-4 py-3">
              <TabsList className="w-full justify-start overflow-x-auto">
                {(['agenda', 'queue', 'recurring', 'calendar'] as const).map(tab => (
                  <TabsTrigger key={tab} value={tab}>{TAB_LABELS[tab]}</TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="agenda" className="mt-0 min-h-0 flex-1 overflow-y-auto">
              {agendaGroups.length === 0 ? (
                <div className="flex h-full min-h-[320px] items-center justify-center px-6 text-center text-sm text-text-tertiary">
                  No scheduled work matches the current filters.
                </div>
              ) : (
                <div className="min-h-full divide-y divide-border">
                  {agendaGroups.map(([label, groupTasks]) => (
                    <section key={label}>
                      <SchedulerSectionHeading title={label} count={groupTasks.length} />
                      <div>
                        {groupTasks.map(task => {
                          const projectName = projects.find(project => project.id === task.projectId)?.name ?? task.projectId
                          const agentName = agentNames.get(task.assigneeId ?? '') ?? task.assigneeId ?? 'Unassigned'

                          return (
                            <SchedulerTaskRow
                              key={task.id}
                              task={task}
                              isSelected={task.id === selectedTaskId}
                              projectName={projectName}
                              agentName={agentName}
                              onSelect={setSelectedTaskId}
                            />
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="queue" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid gap-4 xl:grid-cols-3">
                {([
                  ['Queued', queueBuckets.queued, 'Tasks waiting for dispatch slot or readiness confirmation.'],
                  ['Blocked', queueBuckets.blocked, 'Tasks that cannot launch yet and need operator attention.'],
                  ['Failed', queueBuckets.failed, 'Tasks whose recent dispatch attempt did not complete cleanly.'],
                ] as const).map(([title, bucketTasks, description]) => (
                  <Card key={title} className="overflow-hidden border-border bg-surface-secondary">
                    <SchedulerSectionHeading title={title} count={bucketTasks.length} />
                    <div className="space-y-3 p-4">
                      <p className="text-sm text-text-secondary">{description}</p>
                      {bucketTasks.length === 0 ? (
                        <div className="border border-dashed border-border px-3 py-6 text-sm text-text-tertiary">No tasks in this bucket.</div>
                      ) : (
                        <div className="overflow-hidden border border-border bg-surface">
                          {bucketTasks.map(task => (
                            <SchedulerTaskRow
                              key={task.id}
                              task={task}
                              isSelected={task.id === selectedTaskId}
                              projectName={projectNames.get(task.projectId) ?? task.projectId}
                              agentName={agentNames.get(task.assigneeId ?? '') ?? task.assigneeId ?? 'Unassigned'}
                              onSelect={setSelectedTaskId}
                              variant="queue"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="recurring" className="mt-0 min-h-0 flex-1 overflow-y-auto">
              <div className="border-b border-accent px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">Recurring Control</div>
                    <p className="mt-1 text-sm text-text-secondary">Inspect recurring rules, confirm next-run timing, and open a schedule before it lands back in the queue.</p>
                  </div>
                  <Badge variant="secondary" className="border-brand/15 bg-brand-muted text-brand">
                    <Repeat2 className="mr-1 h-3 w-3" />
                    {recurringTasks.length} rules
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] border-b border-accent px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                <span>Task</span>
                <span>Project</span>
                <span>Rule</span>
                <span>Next Run</span>
                <span>State</span>
              </div>
              {recurringTasks.length === 0 ? (
                <div className="flex min-h-[320px] items-center justify-center px-6 text-center text-sm text-text-tertiary">
                  No recurring schedules match the current filters.
                </div>
              ) : (
                recurringTasks.map(task => {
                  const projectName = projects.find(project => project.id === task.projectId)?.name ?? task.projectId
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTaskId(task.id)}
                      className={cn(
                        'grid w-full grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-3 border-b border-border px-4 py-4 text-left text-sm transition-colors hover:bg-brand-muted/20',
                        selectedTaskId === task.id && 'bg-brand-muted/25',
                      )}
                    >
                      <span className="truncate font-semibold uppercase tracking-[0.08em] text-text-primary">{task.title}</span>
                      <span className="truncate text-text-secondary">{projectName}</span>
                      <span className="truncate text-text-secondary">{task.cronSchedule}</span>
                      <span className="text-text-secondary">{formatTimestamp(task.nextRunAt)}</span>
                      <span className="truncate text-text-secondary">{normalizeDispatchState(task)}</span>
                    </button>
                  )
                })
              )}
            </TabsContent>

            <TabsContent value="calendar" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
              <div className="flex h-full min-h-[320px] flex-col justify-between border border-dashed border-border bg-surface-secondary/50 p-5">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">Phase 2 Surface</div>
                  <h2 className="text-lg font-semibold uppercase tracking-[0.08em] text-text-primary">Calendar View Reserved</h2>
                  <p className="max-w-2xl text-sm text-text-secondary">
                    Week and day timeline interactions land later. Phase 1 keeps the route, shell, and operator framing in place without shipping consumer-style calendar behavior prematurely.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <Card className="border-border bg-surface p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">Week View</div>
                    <div className="mt-2 text-sm text-text-secondary">Primary planning grid for scheduled task density.</div>
                  </Card>
                  <Card className="border-border bg-surface p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">Day View</div>
                    <div className="mt-2 text-sm text-text-secondary">Tight operator timeline for rescheduling and launch checks.</div>
                  </Card>
                  <Card className="border-border bg-surface p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">Drag / Move</div>
                    <div className="mt-2 text-sm text-text-secondary">Reserved for later schedule editing workflows.</div>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        <Card className="min-h-0 overflow-hidden">
          <SchedulerSectionHeading title="Detail" count={selectedTask ? 1 : 0} />
          {selectedTask ? (
            <div className="flex h-full flex-col gap-4 p-4">
              <div className="space-y-2 border-b border-border pb-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">Selected Task</div>
                <h2 className="text-lg font-semibold uppercase tracking-[0.08em] text-text-primary">{selectedTask.title}</h2>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className={STATUS_BADGE_CLASS[selectedTask.status] ?? 'border-border bg-surface-secondary text-text-secondary'}>
                    {selectedTask.status}
                  </Badge>
                  <Badge variant="secondary" className={DISPATCH_BADGE_CLASS[normalizeDispatchState(selectedTask)] ?? 'border-border bg-surface-secondary text-text-secondary'}>
                    {normalizeDispatchState(selectedTask)}
                  </Badge>
                  {selectedTask.cronSchedule ? (
                    <Badge variant="secondary" className="border-brand/15 bg-brand-muted text-brand">
                      <Repeat2 className="mr-1 h-3 w-3" />
                      recurring
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                  <span className="text-text-secondary">Next run</span>
                  <span className="text-right font-medium text-text-primary">{formatTimestamp(selectedTask.nextRunAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                  <span className="text-text-secondary">Recurrence</span>
                  <span className="text-right font-medium text-text-primary">{selectedTask.cronSchedule ?? 'One-time run'}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                  <span className="text-text-secondary">Project</span>
                  <span className="text-right font-medium text-text-primary">{selectedProjectName}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                  <span className="text-text-secondary">Agent</span>
                  <span className="text-right font-medium text-text-primary">{selectedAgentName}</span>
                </div>
                <div className="flex items-start justify-between gap-3 border-b border-border pb-2">
                  <span className="text-text-secondary">Dispatch note</span>
                  <span className="max-w-[180px] text-right font-medium text-text-primary">
                    {selectedDispatchSummary?.message ?? selectedTask.blockedReason ?? selectedTask.dispatchReason ?? 'Ready for operator action.'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-text-secondary">Last dispatch attempt</span>
                  <span className="text-right font-medium text-text-primary">{formatTimestamp(selectedTask.lastDispatchAttemptAt)}</span>
                </div>
              </div>

              <div className="rounded-lg border border-accent/30 bg-surface-secondary p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">Reschedule</div>
                    <p className="mt-1 text-sm text-text-secondary">Move the next execution without leaving Scheduler.</p>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => void handleReschedule()} disabled={schedulerAction !== null}>
                    {schedulerAction === 'reschedule' ? 'Saving…' : 'Save'}
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  <Input
                    type="datetime-local"
                    value={rescheduleInput}
                    onChange={(event) => setRescheduleInput(event.target.value)}
                    aria-label="Reschedule next run"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRescheduleInput(toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000).toISOString()))}>
                      In 1h
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRescheduleInput(toDateTimeLocalValue(new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()))}>
                      In 4h
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRescheduleInput(buildTomorrowNineLocalValue())}>
                      Tomorrow 9am
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-accent/30 bg-surface-secondary p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-text-tertiary">Run Now</div>
                    <p className="mt-1 text-sm text-text-secondary">Clear the schedule hold and launch the assigned agent immediately.</p>
                  </div>
                  <Button type="button" onClick={() => void handleRunNow()} disabled={schedulerAction !== null || !selectedTaskHasAssignee}>
                    <Play className="h-4 w-4" />
                    {schedulerAction === 'run-now' ? 'Launching…' : 'Run Now'}
                  </Button>
                </div>
                <div className="mt-3 text-xs uppercase tracking-[0.14em] text-text-tertiary">
                  {selectedTaskHasAssignee ? `Launch target: ${selectedAgentName}` : 'Assign an agent before using run now.'}
                </div>
              </div>

              {schedulerError ? (
                <div className="rounded-lg border border-status-blocked/25 bg-status-blocked/10 px-3 py-2 text-sm text-status-blocked">
                  {schedulerError}
                </div>
              ) : null}

              <div className="mt-auto grid gap-2 pt-2">
                <Link
                  to={`/tasks/${selectedTask.id}`}
                  className="lcd-button inline-flex h-10 items-center justify-center gap-2 rounded-none border border-accent bg-transparent px-4 text-sm font-medium uppercase tracking-[0.14em] text-accent transition-[background-color,border-color,color,box-shadow] duration-150 ease-out hover:border-brand-bright hover:bg-transparent hover:text-brand-bright hover:shadow-[0_0_12px_rgba(255,215,0,0.4)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-brand-bright"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Task
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center px-6 text-center text-sm text-text-tertiary">
              Select a scheduled task to inspect run timing, recurrence, and dispatch readiness.
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
