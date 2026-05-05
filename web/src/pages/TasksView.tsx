import { memo, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { useAppStore } from '../store/appStore';
import { Search, Plus, Filter, Bot, Check, Clock, AlertTriangle, Circle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { TaskPriority, TaskStatus } from '../types';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getTaskDispatchSummary, getTaskSurfaceLabel, getTaskSurfaceState } from '../lib/taskPresentation';

type SortField = 'id' | 'title' | 'project' | 'status' | 'priority' | 'assignee' | null
type SortDirection = 'asc' | 'desc' | null
type FilterMenu = 'project' | 'status' | 'priority' | 'assignee' | null

type TasksViewUrlState = {
  searchQuery: string
  sortField: SortField
  sortDir: SortDirection
  projectFilters: Set<string>
  statusFilters: Set<string>
  priorityFilters: Set<string>
  assigneeFilters: Set<string>
}

const SORT_FIELDS = new Set<Exclude<SortField, null>>(['id', 'title', 'project', 'status', 'priority', 'assignee'])
const SORT_DIRECTIONS = new Set<Exclude<SortDirection, null>>(['asc', 'desc'])
const TASKS_VIEW_QUERY_KEYS = ['search', 'project', 'status', 'priority', 'assignee', 'sort', 'dir'] as const

const STATUS_ORDER: Record<TaskStatus, number> = {
  review: 0,
  'waiting-approval': 1,
  scheduled: 2,
  failed: 3,
  blocked: 4,
  'in-progress': 5,
  todo: 6,
  done: 7,
  cancelled: 8,
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' })
}

function parseCsvParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key)
  if (!value) return new Set<string>()

  return new Set(
    value
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean),
  )
}

function areSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false
  for (const value of left) {
    if (!right.has(value)) return false
  }
  return true
}

function parseTasksViewUrlState(search: string): TasksViewUrlState {
  const searchParams = new URLSearchParams(search)
  const sortFieldValue = searchParams.get('sort')
  const sortDirValue = searchParams.get('dir')
  const sortField = sortFieldValue && SORT_FIELDS.has(sortFieldValue as Exclude<SortField, null>) ? sortFieldValue as Exclude<SortField, null> : null
  const sortDir = sortDirValue && SORT_DIRECTIONS.has(sortDirValue as Exclude<SortDirection, null>) ? sortDirValue as Exclude<SortDirection, null> : null

  return {
    searchQuery: searchParams.get('search') ?? '',
    sortField: sortField && sortDir ? sortField : null,
    sortDir: sortField && sortDir ? sortDir : null,
    projectFilters: parseCsvParam(searchParams, 'project'),
    statusFilters: parseCsvParam(searchParams, 'status'),
    priorityFilters: parseCsvParam(searchParams, 'priority'),
    assigneeFilters: parseCsvParam(searchParams, 'assignee'),
  }
}

function serializeTasksViewUrlState(currentSearch: string, state: TasksViewUrlState) {
  const searchParams = new URLSearchParams(currentSearch)
  const normalizedSearch = state.searchQuery.trim()

  for (const key of TASKS_VIEW_QUERY_KEYS) {
    searchParams.delete(key)
  }

  if (normalizedSearch) {
    searchParams.set('search', normalizedSearch)
  }

  const filterEntries: Array<[string, Set<string>]> = [
    ['project', state.projectFilters],
    ['status', state.statusFilters],
    ['priority', state.priorityFilters],
    ['assignee', state.assigneeFilters],
  ]

  for (const [key, values] of filterEntries) {
    if (values.size === 0) continue
    searchParams.set(key, [...values].sort(compareText).join(','))
  }

  if (state.sortField && state.sortDir) {
    searchParams.set('sort', state.sortField)
    searchParams.set('dir', state.sortDir)
  }

  return searchParams.toString()
}

function formatRelativeTime(value?: string) {
  if (!value) return '—'
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return value

  const diffMs = timestamp.getTime() - Date.now()
  const diffMinutes = Math.round(diffMs / 60000)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

  if (Math.abs(diffMinutes) < 1) return 'just now'
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, 'minute')

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) return formatter.format(diffHours, 'hour')

  const diffDays = Math.round(diffHours / 24)
  return formatter.format(diffDays, 'day')
}

function getPriorityBadgeClass(priority: TaskPriority) {
  switch (priority) {
    case 'critical':
      return 'border-status-blocked/20 bg-status-blocked/10 text-status-blocked'
    case 'high':
      return 'border-status-waiting/20 bg-status-waiting/10 text-status-waiting'
    case 'medium':
      return 'border-border bg-surface-secondary text-text-secondary'
    case 'low':
      return 'border-border/70 bg-surface-secondary/60 text-text-tertiary'
  }
}

export const TasksView = memo(function TasksView({ onTaskSelect }: { onTaskSelect?: (taskId: string) => void } = {}) {
  const tasks = useAppStore(state => state.tasks);
  const agents = useAppStore(state => state.agents);
  const projects = useAppStore(state => state.projects);
  const isLoading = useAppStore(state => state.isLoading);
  const openNewTaskModal = useAppStore(state => state.openNewTaskModal);
  const location = useLocation()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>(null)
  const [sortDir, setSortDir] = useState<SortDirection>(null)
  const [openFilterMenu, setOpenFilterMenu] = useState<FilterMenu>(null)
  const [projectFilters, setProjectFilters] = useState<Set<string>>(new Set())
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set())
  const [priorityFilters, setPriorityFilters] = useState<Set<string>>(new Set())
  const [assigneeFilters, setAssigneeFilters] = useState<Set<string>>(new Set())
  const filterMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setOpenFilterMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const nextState = parseTasksViewUrlState(location.search)

    setSearchQuery(current => current === nextState.searchQuery ? current : nextState.searchQuery)
    setSortField(current => current === nextState.sortField ? current : nextState.sortField)
    setSortDir(current => current === nextState.sortDir ? current : nextState.sortDir)
    setProjectFilters(current => areSetsEqual(current, nextState.projectFilters) ? current : nextState.projectFilters)
    setStatusFilters(current => areSetsEqual(current, nextState.statusFilters) ? current : nextState.statusFilters)
    setPriorityFilters(current => areSetsEqual(current, nextState.priorityFilters) ? current : nextState.priorityFilters)
    setAssigneeFilters(current => areSetsEqual(current, nextState.assigneeFilters) ? current : nextState.assigneeFilters)
  }, [location.search])

  const serializedUrlState = useMemo(() => serializeTasksViewUrlState(location.search, {
    searchQuery,
    sortField,
    sortDir,
    projectFilters,
    statusFilters,
    priorityFilters,
    assigneeFilters,
  }), [assigneeFilters, location.search, priorityFilters, projectFilters, searchQuery, sortDir, sortField, statusFilters])

  useEffect(() => {
    const currentSearch = location.search.startsWith('?') ? location.search.slice(1) : location.search
    if (serializedUrlState === currentSearch) return

    navigate({ search: serializedUrlState ? `?${serializedUrlState}` : '' }, { replace: true })
  }, [location.search, navigate, serializedUrlState])

  const getStatusIcon = (surfaceState: ReturnType<typeof getTaskSurfaceState>) => {
    switch(surfaceState) {
      case 'waiting': return <Clock className="w-4 h-4 text-status-waiting" />;
      case 'queued': return <Clock className="w-4 h-4 text-status-active" />;
      case 'dispatch-blocked': return <AlertTriangle className="w-4 h-4 text-status-blocked" />;
      case 'dispatch-failed': return <AlertTriangle className="w-4 h-4 text-status-blocked" />;
      case 'review': return <CheckCircle2 className="w-4 h-4 text-status-active" />;
      case 'waiting-approval': return <Clock className="w-4 h-4 text-status-waiting" />;
      case 'scheduled': return <Clock className="w-4 h-4 text-text-tertiary" />;
      case 'blocked': return <AlertTriangle className="w-4 h-4 text-status-blocked" />;
      case 'in-progress': return <Circle className="w-4 h-4 text-status-active fill-current" />;
      case 'done': return <Check className="w-4 h-4 text-status-done" />;
      case 'todo': return <Circle className="w-4 h-4 text-text-tertiary" />;
      case 'cancelled': return <AlertTriangle className="w-4 h-4 text-text-tertiary" />;
    }
  };

  const visibleTasks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const filteredTasks = normalizedQuery.length === 0
      ? tasks
      : tasks.filter(task => task.title.toLowerCase().includes(normalizedQuery))

    const narrowedTasks = filteredTasks.filter(task => {
      const matchesProject = projectFilters.size === 0 || projectFilters.has(task.projectId)
      const matchesStatus = statusFilters.size === 0 || statusFilters.has(task.status)
      const matchesPriority = priorityFilters.size === 0 || priorityFilters.has(task.priority)
      const assigneeKey = task.assigneeId ?? '__unassigned__'
      const matchesAssignee = assigneeFilters.size === 0 || assigneeFilters.has(assigneeKey)
      return matchesProject && matchesStatus && matchesPriority && matchesAssignee
    })

    const sortedTasks = [...narrowedTasks].sort((left, right) => {
      if (sortField === null || sortDir === null) {
        return STATUS_ORDER[left.status] - STATUS_ORDER[right.status] || PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] || compareText(left.title, right.title)
      }

      const leftProject = projects.find(project => project.id === left.projectId)?.name ?? ''
      const rightProject = projects.find(project => project.id === right.projectId)?.name ?? ''
      const leftAgent = agents.find(agent => agent.id === left.assigneeId)?.name ?? ''
      const rightAgent = agents.find(agent => agent.id === right.assigneeId)?.name ?? ''

      let result = 0
      switch (sortField) {
        case 'id':
          result = compareText(left.id, right.id)
          break
        case 'title':
          result = compareText(left.title, right.title)
          break
        case 'project':
          result = compareText(leftProject, rightProject)
          break
        case 'status':
          result = STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
          break
        case 'priority':
          result = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
          break
        case 'assignee':
          result = compareText(leftAgent, rightAgent)
          break
        default:
          result = 0
      }

      if (result === 0) {
        result = compareText(left.title, right.title)
      }

      return sortDir === 'asc' ? result : result * -1
    })

    return sortedTasks
  }, [agents, assigneeFilters, priorityFilters, projectFilters, projects, searchQuery, sortDir, sortField, statusFilters, tasks])

  function toggleSort(field: Exclude<SortField, null>) {
    if (sortField !== field) {
      setSortField(field)
      setSortDir('asc')
      return
    }

    if (sortDir === 'asc') {
      setSortDir('desc')
      return
    }

    if (sortDir === 'desc') {
      setSortField(null)
      setSortDir(null)
      return
    }

    setSortDir('asc')
  }

  function renderSortIcon(field: Exclude<SortField, null>) {
    if (sortField !== field || sortDir === null) return null
    return sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
  }

  function toggleFilterValue(setter: Dispatch<SetStateAction<Set<string>>>, value: string, universeSize: number) {
    setter(current => {
      const next = new Set(current)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }

      return next.size === 0 || next.size === universeSize ? new Set() : next
    })
    setOpenFilterMenu(null)
  }

  function clearAllFilters() {
    setSearchQuery('')
    setProjectFilters(new Set())
    setStatusFilters(new Set())
    setPriorityFilters(new Set())
    setAssigneeFilters(new Set())
  }

  const projectOptions = projects.map(project => ({ value: project.id, label: project.name }))
  const statusOptions: Array<{ value: TaskStatus; label: string; tone: string }> = [
    { value: 'todo', label: 'Todo', tone: 'bg-text-tertiary' },
    { value: 'in-progress', label: 'In progress', tone: 'bg-status-active' },
    { value: 'blocked', label: 'Blocked', tone: 'bg-status-blocked' },
    { value: 'review', label: 'Review', tone: 'bg-status-active' },
    { value: 'waiting-approval', label: 'Waiting approval', tone: 'bg-status-waiting' },
    { value: 'scheduled', label: 'Scheduled', tone: 'bg-text-tertiary' },
    { value: 'done', label: 'Done', tone: 'bg-status-done' },
    { value: 'cancelled', label: 'Cancelled', tone: 'bg-text-tertiary' },
  ]
  const priorityOptions: Array<{ value: TaskPriority; label: string; tone: string }> = [
    { value: 'critical', label: 'Critical', tone: 'bg-status-blocked' },
    { value: 'high', label: 'High', tone: 'bg-status-waiting' },
    { value: 'medium', label: 'Medium', tone: 'bg-text-secondary' },
    { value: 'low', label: 'Low', tone: 'bg-text-tertiary' },
  ]
  const assigneeOptions = [
    { value: '__unassigned__', label: 'Unassigned' },
    ...agents.map(agent => ({ value: agent.id, label: agent.name })),
  ]
  const activeFilterCount = projectFilters.size + statusFilters.size + priorityFilters.size + assigneeFilters.size

  return (
    <div className="flex min-h-full w-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-text-primary">Tasks</h1>
            <p className="text-sm text-text-secondary">
              {visibleTasks.length === tasks.length ? `${tasks.length} tasks` : `${visibleTasks.length} of ${tasks.length} tasks`}
            </p>
          </div>
          <Button
            onClick={openNewTaskModal}
            className="self-start"
          >
            <Plus className="w-4 h-4" /> New Task
          </Button>
        </div>
        
        <div className="flex flex-wrap items-end gap-3" ref={filterMenuRef}>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs font-medium uppercase tracking-[0.14em] text-text-tertiary">
            Search tasks
            <div className="relative flex items-center gap-2">
              <Search className="absolute left-3 h-4 w-4 text-text-tertiary" />
              <Input
                type="text"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search tasks..." 
                aria-label="Search tasks"
                className="pl-9"
              />
            </div>
          </label>
          <div className="relative">
            <Button variant="outline" className={clsx('gap-1.5 px-3', projectFilters.size > 0 && 'border-accent text-accent')} onClick={() => setOpenFilterMenu(current => current === 'project' ? null : 'project')}>
              Project{projectFilters.size > 0 ? ` •${projectFilters.size}` : ''} <Filter className="w-3.5 h-3.5" />
            </Button>
            {openFilterMenu === 'project' && (
              <div className="absolute left-0 top-11 z-30 min-w-40 rounded-xl border border-border bg-surface p-2 shadow-panel">
                <button type="button" onClick={() => { setProjectFilters(new Set()); setOpenFilterMenu(null) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-secondary hover:text-text-primary">All Projects</button>
                {projectOptions.map(option => (
                  <button key={option.value} type="button" onClick={() => toggleFilterValue(setProjectFilters, option.value, projectOptions.length)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-secondary">
                    <input type="checkbox" readOnly checked={projectFilters.has(option.value)} className="pointer-events-none" />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <Button variant="outline" className={clsx('gap-1.5 px-3', statusFilters.size > 0 && 'border-accent text-accent')} onClick={() => setOpenFilterMenu(current => current === 'status' ? null : 'status')}>
              Status{statusFilters.size > 0 ? ` •${statusFilters.size}` : ''} <Filter className="w-3.5 h-3.5" />
            </Button>
            {openFilterMenu === 'status' && (
              <div className="absolute left-0 top-11 z-30 min-w-40 rounded-xl border border-border bg-surface p-2 shadow-panel">
                {statusOptions.map(option => (
                  <button key={option.value} type="button" onClick={() => toggleFilterValue(setStatusFilters, option.value, statusOptions.length)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-secondary">
                    <input type="checkbox" readOnly checked={statusFilters.has(option.value)} className="pointer-events-none" />
                    <span className={clsx('h-2 w-2 rounded-full', option.tone)} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <Button variant="outline" className={clsx('gap-1.5 px-3', priorityFilters.size > 0 && 'border-accent text-accent')} onClick={() => setOpenFilterMenu(current => current === 'priority' ? null : 'priority')}>
              Priority{priorityFilters.size > 0 ? ` •${priorityFilters.size}` : ''} <Filter className="w-3.5 h-3.5" />
            </Button>
            {openFilterMenu === 'priority' && (
              <div className="absolute left-0 top-11 z-30 min-w-40 rounded-xl border border-border bg-surface p-2 shadow-panel">
                {priorityOptions.map(option => (
                  <button key={option.value} type="button" onClick={() => toggleFilterValue(setPriorityFilters, option.value, priorityOptions.length)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-secondary">
                    <input type="checkbox" readOnly checked={priorityFilters.has(option.value)} className="pointer-events-none" />
                    <span className={clsx('h-2 w-2 rounded-full', option.tone)} />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <Button variant="outline" className={clsx('gap-1.5 px-3', assigneeFilters.size > 0 && 'border-accent text-accent')} onClick={() => setOpenFilterMenu(current => current === 'assignee' ? null : 'assignee')}>
              Assignee{assigneeFilters.size > 0 ? ` •${assigneeFilters.size}` : ''} <Filter className="w-3.5 h-3.5" />
            </Button>
            {openFilterMenu === 'assignee' && (
              <div className="absolute left-0 top-11 z-30 min-w-40 rounded-xl border border-border bg-surface p-2 shadow-panel">
                {assigneeOptions.map(option => (
                  <button key={option.value} type="button" onClick={() => toggleFilterValue(setAssigneeFilters, option.value, assigneeOptions.length)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-secondary">
                    <input type="checkbox" readOnly checked={assigneeFilters.has(option.value)} className="pointer-events-none" />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {activeFilterCount > 0 && (
            <Button variant="ghost" className="px-2" onClick={clearAllFilters}>
              Clear all
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="h-full overflow-auto">
          {isLoading && tasks.length === 0 ? (
            <div className="space-y-3 p-4">
              <div className="h-10 rounded-lg bg-surface-secondary animate-pulse" />
              <div className="h-10 rounded-lg bg-surface-secondary animate-pulse" />
              <div className="h-10 rounded-lg bg-surface-secondary animate-pulse" />
              <div className="h-10 rounded-lg bg-surface-secondary animate-pulse" />
            </div>
          ) : (
          <table className="min-w-[1040px] w-full border-collapse text-left">
          <thead>
            <tr className="bg-surface-secondary text-xs uppercase tracking-wider text-text-tertiary border-b border-border">
              <th className="px-4 py-3 font-semibold w-10"></th>
              <th className="px-4 py-3 font-semibold w-24"><button type="button" onClick={() => toggleSort('id')} className="inline-flex items-center gap-1">ID {renderSortIcon('id')}</button></th>
              <th className="px-4 py-3 font-semibold"><button type="button" onClick={() => toggleSort('title')} className="inline-flex items-center gap-1">Title {renderSortIcon('title')}</button></th>
              <th className="px-4 py-3 font-semibold w-32"><button type="button" onClick={() => toggleSort('project')} className="inline-flex items-center gap-1">Project {renderSortIcon('project')}</button></th>
              <th className="px-4 py-3 font-semibold w-24"><button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1">Status {renderSortIcon('status')}</button></th>
              <th className="px-4 py-3 font-semibold w-28"><button type="button" onClick={() => toggleSort('priority')} className="inline-flex items-center gap-1">Priority {renderSortIcon('priority')}</button></th>
              <th className="px-4 py-3 font-semibold w-40"><button type="button" onClick={() => toggleSort('assignee')} className="inline-flex items-center gap-1">Assignee {renderSortIcon('assignee')}</button></th>
              <th className="px-4 py-3 font-semibold w-28">Created</th>
              <th className="px-4 py-3 font-semibold w-28">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleTasks.map(task => {
              const project = projects.find(p => p.id === task.projectId);
              const agent = agents.find(a => a.id === task.assigneeId);
              const surfaceState = getTaskSurfaceState(task)
              const dispatchSummary = getTaskDispatchSummary(task)
              
              return (
                <tr
                  key={task.id}
                  className="group transition-colors hover:bg-surface-secondary/50"
                >
                  <td className="px-4 py-3">
                    {getStatusIcon(surfaceState)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-text-secondary">
                    {task.id}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                    <div className="max-w-sm xl:max-w-md">
                      {onTaskSelect ? (
                        <button
                          type="button"
                          onClick={() => onTaskSelect(task.id)}
                          className="flex items-center gap-2 truncate rounded-sm text-left underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <span className="truncate">{task.title}</span>
                        </button>
                      ) : (
                        <Link
                          to={`/tasks/${task.id}`}
                          className="flex items-center gap-2 truncate rounded-sm underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <span className="truncate">{task.title}</span>
                        </Link>
                      )}
                      {dispatchSummary ? (
                        <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-text-tertiary">
                          {dispatchSummary.label} · {dispatchSummary.message}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary truncate">
                    {project?.name || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      "rounded border px-2 py-1 text-[11px] font-bold uppercase tracking-wider",
                      surfaceState === 'in-progress' && "border-status-active/20 bg-blue-50 text-status-active",
                      surfaceState === 'review' && "border-status-active/20 bg-brand-muted text-status-active",
                      surfaceState === 'waiting-approval' && "border-status-waiting/20 bg-amber-50 text-status-waiting",
                      surfaceState === 'scheduled' && "border-border bg-slate-100 text-text-secondary",
                      (surfaceState === 'blocked' || surfaceState === 'dispatch-blocked' || surfaceState === 'dispatch-failed') && "border-status-blocked/20 bg-red-50 text-status-blocked",
                      (surfaceState === 'waiting' || surfaceState === 'queued') && "border-status-waiting/20 bg-status-waiting/10 text-status-waiting",
                      surfaceState === 'done' && "border-status-done/20 bg-green-50 text-status-done",
                      surfaceState === 'todo' && "border-border bg-slate-100 text-status-todo",
                      surfaceState === 'cancelled' && "border-border bg-slate-100 text-text-secondary"
                    )}>
                      {getTaskSurfaceLabel(task)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className={getPriorityBadgeClass(task.priority)}>
                      {task.priority}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {agent ? (
                      <div className="flex items-center gap-1.5 text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">
                        <Bot className="w-4 h-4 text-text-tertiary group-hover:text-accent transition-colors" />
                        <span className="truncate">{agent.name}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary" title={task.createdAt || ''}>
                    {formatRelativeTime(task.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary" title={task.updatedAt && task.updatedAt !== task.createdAt ? task.updatedAt : ''}>
                    {task.updatedAt && task.updatedAt !== task.createdAt ? formatRelativeTime(task.updatedAt) : '—'}
                  </td>
                </tr>
              );
            })}
            {!isLoading && visibleTasks.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-text-tertiary">
                  No tasks match the current search.
                </td>
              </tr>
            )}
          </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
})
