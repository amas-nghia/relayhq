import { useMemo, useState } from 'react';

import { useAppStore } from '../store/appStore';
import { Search, Plus, Filter, Bot, Check, Clock, AlertTriangle, Circle, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { TaskPriority, TaskStatus } from '../types';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';

type SortField = 'id' | 'title' | 'project' | 'status' | 'priority' | 'assignee' | null
type SortDirection = 'asc' | 'desc' | null

const STATUS_ORDER: Record<TaskStatus, number> = {
  'waiting-approval': 0,
  blocked: 1,
  'in-progress': 2,
  todo: 3,
  done: 4,
  cancelled: 5,
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

export function TasksView() {
  const tasks = useAppStore(state => state.tasks);
  const agents = useAppStore(state => state.agents);
  const projects = useAppStore(state => state.projects);
  const openDetail = useAppStore(state => state.openTaskDetail);
  const openNewTaskModal = useAppStore(state => state.openNewTaskModal);
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>(null)
  const [sortDir, setSortDir] = useState<SortDirection>(null)

  const getStatusIcon = (status: TaskStatus) => {
    switch(status) {
      case 'waiting-approval': return <Clock className="w-4 h-4 text-status-waiting" />;
      case 'blocked': return <AlertTriangle className="w-4 h-4 text-status-blocked" />;
      case 'in-progress': return <Circle className="w-4 h-4 text-status-active fill-current" />;
      case 'done': return <Check className="w-4 h-4 text-status-done" />;
      case 'todo': return <Circle className="w-4 h-4 text-text-tertiary" />;
    }
  };

  const getStatusLabel = (status: TaskStatus) => {
    switch(status) {
      case 'waiting-approval': return 'waiting';
      case 'blocked': return 'blocked';
      case 'in-progress': return 'in-prog';
      case 'done': return 'done';
      case 'todo': return 'todo';
    }
  };

  const visibleTasks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const filteredTasks = normalizedQuery.length === 0
      ? tasks
      : tasks.filter(task => task.title.toLowerCase().includes(normalizedQuery))

    const sortedTasks = [...filteredTasks].sort((left, right) => {
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
  }, [agents, projects, searchQuery, sortDir, sortField, tasks])

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
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] flex items-center gap-2">
            <Search className="w-4 h-4 absolute left-3 text-text-tertiary" />
            <Input
              type="text" 
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search tasks..." 
              className="pl-9"
            />
          </div>
          <Button variant="outline" className="gap-1.5 px-3">
            Project <Filter className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" className="gap-1.5 px-3">
            Status <Filter className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" className="gap-1.5 px-3">
            Assignee <Filter className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="h-full overflow-auto">
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
              
              return (
                <tr 
                  key={task.id} 
                  onClick={() => openDetail(task.id)}
                  className="hover:bg-surface-secondary/50 transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3">
                    {getStatusIcon(task.status)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-text-secondary">
                    {task.id}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                    <span className="truncate flex items-center gap-2 max-w-sm xl:max-w-md">{task.title}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary truncate">
                    {project?.name || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      "text-[11px] font-bold uppercase tracking-wider p-2 rounded",
                      task.status === 'in-progress' && "bg-blue-50 text-status-active",
                      task.status === 'waiting-approval' && "bg-amber-50 text-status-waiting",
                      task.status === 'blocked' && "bg-red-50 text-status-blocked",
                      task.status === 'done' && "bg-green-50 text-status-done",
                      task.status === 'todo' && "bg-slate-100 text-status-todo"
                    )}>
                      {getStatusLabel(task.status)}
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
            {visibleTasks.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-text-tertiary">
                  No tasks match the current search.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
