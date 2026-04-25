import { useNavigate, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAppStore } from '../store/appStore'
import { CheckCircle2, Circle, AlertTriangle, Clock, Ban, KanbanSquare, ArrowLeft } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import type { Task, TaskStatus } from '../types'
import clsx from 'clsx'

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: ReactNode; color: string }> = {
  'todo':             { label: 'To do',       icon: <Circle className="w-4 h-4" />,            color: 'text-text-tertiary' },
  'in-progress':      { label: 'In progress', icon: <Circle className="w-4 h-4 fill-current" />, color: 'text-status-active' },
  'waiting-approval': { label: 'Waiting',     icon: <Clock className="w-4 h-4" />,              color: 'text-status-waiting' },
  'blocked':          { label: 'Blocked',     icon: <AlertTriangle className="w-4 h-4" />,       color: 'text-status-blocked' },
  'done':             { label: 'Done',        icon: <CheckCircle2 className="w-4 h-4" />,        color: 'text-status-done' },
  'cancelled':        { label: 'Cancelled',   icon: <Ban className="w-4 h-4" />,                 color: 'text-text-tertiary' },
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'border-red-500/20 bg-red-500/10 text-red-600',
  high:     'border-orange-500/20 bg-orange-500/10 text-orange-600',
  medium:   'border-yellow-500/20 bg-yellow-500/10 text-yellow-600',
  low:      'border-border bg-surface-secondary text-text-tertiary',
}

function TaskRow({ task }: { task: Task; key?: string }) {
  const openTaskDetail = useAppStore(state => state.openTaskDetail)
  const cfg = STATUS_CONFIG[task.status]

  return (
    <button
      type="button"
      onClick={() => openTaskDetail(task.id)}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-secondary"
    >
      <span className={clsx('shrink-0', cfg.color)}>{cfg.icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{task.title}</span>
      <Badge className={clsx('shrink-0 text-xs capitalize', PRIORITY_COLOR[task.priority])}>
        {task.priority}
      </Badge>
      {task.assigneeId && (
        <span className="shrink-0 text-xs text-text-tertiary">{task.assigneeId}</span>
      )}
    </button>
  )
}

export function ProjectView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projects = useAppStore(state => state.projects)
  const tasks = useAppStore(state => state.tasks)

  const project = projects.find(p => p.id === id)
  const projectTasks = tasks.filter(t => t.projectId === id)

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        Project not found.
      </div>
    )
  }

  const statuses: TaskStatus[] = ['in-progress', 'waiting-approval', 'blocked', 'todo', 'done', 'cancelled']
  const countByStatus = Object.fromEntries(
    statuses.map(s => [s, projectTasks.filter(t => t.status === s).length])
  ) as Record<TaskStatus, number>

  const activeTasks = projectTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
  const doneTasks = projectTasks.filter(t => t.status === 'done')

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-surface">
            {project.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-text-primary">{project.name}</h1>
            {project.codebaseRoot && (
              <p className="truncate text-xs text-text-tertiary">{project.codebaseRoot}</p>
            )}
          </div>
        </div>
        {project.boardId && (
          <Button variant="outline" className="shrink-0 gap-2" onClick={() => navigate(`/boards/${project.boardId}`)}>
            <KanbanSquare className="h-4 w-4" />
            Open board
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {statuses.map(s => {
          const cfg = STATUS_CONFIG[s]
          const count = countByStatus[s]
          return (
            <Card key={s} className="flex flex-col items-center gap-1 p-3 text-center">
              <span className={clsx('mb-1', cfg.color)}>{cfg.icon}</span>
              <span className="text-xl font-bold text-text-primary">{count}</span>
              <span className="text-xs text-text-tertiary">{cfg.label}</span>
            </Card>
          )
        })}
      </div>

      {activeTasks.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Active — {activeTasks.length}</h2>
          {activeTasks.map(t => <TaskRow key={t.id} task={t} />)}
        </div>
      )}

      {doneTasks.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Done — {doneTasks.length}</h2>
          {doneTasks.map(t => <TaskRow key={t.id} task={t} />)}
        </div>
      )}

      {projectTasks.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-text-tertiary">
          No tasks yet.
        </div>
      )}
    </div>
  )
}
