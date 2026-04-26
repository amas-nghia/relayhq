import { useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useAppStore } from '../store/appStore'
import {
  ArrowLeft,
  AlertTriangle,
  Archive,
  CalendarDays,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  ExternalLink,
  File,
  FileImage,
  FileText,
  KanbanSquare,
  Link2,
  Paperclip,
  Settings,
  Clock,
  Ban,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { ProjectSettingsDialog } from '../components/project/ProjectSettingsDialog'
import type { Task, TaskStatus } from '../types'
import clsx from 'clsx'

const STATUS_CONFIG: Record<TaskStatus, { label: string; icon: ReactNode; color: string }> = {
  'todo':             { label: 'To do',       icon: <Circle className="w-4 h-4" />,            color: 'text-text-tertiary' },
  'in-progress':      { label: 'In progress', icon: <Circle className="w-4 h-4 fill-current" />, color: 'text-status-active' },
  'scheduled':        { label: 'Scheduled',   icon: <Clock className="w-4 h-4" />,              color: 'text-text-tertiary' },
  'review':           { label: 'Review',      icon: <CheckCircle2 className="w-4 h-4" />,       color: 'text-status-active' },
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

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function getAttachmentIcon(type: string): LucideIcon {
  const normalized = type.toLowerCase()
  if (normalized.includes('image') || normalized.includes('png') || normalized.includes('jpg') || normalized.includes('jpeg') || normalized.includes('svg')) return FileImage
  if (normalized.includes('archive') || normalized.includes('zip') || normalized.includes('tar') || normalized.includes('gz')) return Archive
  if (normalized.includes('link') || normalized.includes('url') || normalized.includes('http')) return Link2
  if (normalized.includes('doc') || normalized.includes('txt') || normalized.includes('pdf') || normalized.includes('md')) return FileText
  return Paperclip
}

function ProjectMeta({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">{label}</div>
        <div className="truncate text-sm font-medium text-text-primary">{value}</div>
      </div>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      {children}
    </Card>
  )
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
  const settings = useAppStore(state => state.settings)
  const loadData = useAppStore(state => state.loadData)
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false)

  const project = projects.find(p => p.id === id)
  const projectTasks = tasks.filter(t => t.projectId === id)

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        Project not found.
      </div>
    )
  }

  const statuses: TaskStatus[] = ['review', 'waiting-approval', 'scheduled', 'in-progress', 'blocked', 'todo', 'done', 'cancelled']
  const countByStatus = Object.fromEntries(
    statuses.map(s => [s, projectTasks.filter(t => t.status === s).length])
  ) as Record<TaskStatus, number>

  const activeTasks = projectTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
  const doneTasks = projectTasks.filter(t => t.status === 'done')
  const links = project.links ?? []
  const attachments = project.attachments ?? []
  const docs = project.docs ?? []
  const hasProjectInfo = hasText(project.description) || hasText(project.status) || hasText(project.budget) || hasText(project.deadline) || hasText(project.codebaseRoot)

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-bold text-surface">
              {project.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold text-text-primary">{project.name}</h1>
                {hasText(project.status) && (
                  <Badge variant="secondary" className="border-status-active/20 bg-status-active/10 text-status-active">
                    {project.status.replace(/-/g, ' ')}
                  </Badge>
                )}
              </div>
              {project.codebaseRoot && <p className="truncate text-xs text-text-tertiary">{project.codebaseRoot}</p>}
            </div>
          </div>
        </div>
        {project.boardId && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="shrink-0" onClick={() => setIsProjectSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="shrink-0 gap-2" onClick={() => navigate(`/boards/${project.boardId}`)}>
              <KanbanSquare className="h-4 w-4" />
              Open board
            </Button>
          </div>
        )}
      </div>

      {hasProjectInfo && (
        <Card className="flex flex-col gap-4 p-4">
          {hasText(project.description) && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-text-primary">Overview</div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-text-secondary">{project.description}</p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {hasText(project.codebaseRoot) && <ProjectMeta label="Codebase" value={project.codebaseRoot} icon={File} />}
            {hasText(project.budget) && <ProjectMeta label="Budget" value={project.budget} icon={CircleDollarSign} />}
            {hasText(project.deadline) && <ProjectMeta label="Deadline" value={project.deadline} icon={CalendarDays} />}
            {hasText(project.status) && <ProjectMeta label="Status" value={project.status.replace(/-/g, ' ')} icon={Clock} />}
          </div>
        </Card>
      )}

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

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={`External links${links.length > 0 ? ` — ${links.length}` : ''}`}>
          {links.length > 0 ? (
            <div className="space-y-2">
              {links.map((link) => (
                <a
                  key={`${link.label}-${link.url}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface"
                >
                  <span className="min-w-0 truncate font-medium">{link.label}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-text-tertiary" />
                </a>
              ))}
            </div>
          ) : (
            <div className="text-sm text-text-tertiary">No external links yet.</div>
          )}
        </SectionCard>

        <SectionCard title={`Attachments${attachments.length > 0 ? ` — ${attachments.length}` : ''}`}>
          {attachments.length > 0 ? (
            <div className="space-y-2">
              {attachments.map((attachment) => {
                const Icon = getAttachmentIcon(attachment.type)
                return (
                  <a
                    key={`${attachment.label}-${attachment.url}`}
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-text-tertiary" />
                      <span className="truncate font-medium">{attachment.label}</span>
                    </div>
                    <Badge variant="secondary" className="shrink-0 border-border bg-surface text-text-tertiary">
                      {attachment.type}
                    </Badge>
                  </a>
                )
              })}
            </div>
          ) : (
            <div className="text-sm text-text-tertiary">No attachments uploaded.</div>
          )}
        </SectionCard>

        <SectionCard title={`Docs${docs.length > 0 ? ` — ${docs.length}` : ''}`}>
          {docs.length > 0 ? (
            <div className="space-y-2">
              {docs.map((doc) => (
                <a
                  key={doc.id}
                  href={doc.sourcePath}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-3 py-2 text-left transition-colors hover:bg-surface"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-text-tertiary" />
                      <span className="truncate text-sm font-medium text-text-primary">{doc.title}</span>
                      <Badge variant="secondary" className="border-border bg-surface text-text-tertiary">{doc.docType}</Badge>
                      <Badge variant="secondary" className="border-border bg-surface text-text-tertiary">{doc.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-text-tertiary">{doc.visibility} · {doc.sourcePath}</div>
                  </div>
                  <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                </a>
              ))}
            </div>
          ) : (
            <div className="text-sm text-text-tertiary">No related docs yet.</div>
          )}
        </SectionCard>
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

      <ProjectSettingsDialog
        open={isProjectSettingsOpen}
        project={project}
        vaultPath={settings?.vaultRoot || settings?.resolvedRoot || ''}
        onClose={() => setIsProjectSettingsOpen(false)}
        onSaved={loadData}
      />
    </div>
  )
}
