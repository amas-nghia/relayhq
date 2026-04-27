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
import { ProjectMark } from '../components/project/ProjectMark'
import clsx from 'clsx'

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

function ProjectMeta({ label, value, icon: Icon, valueClassName }: { label: string; value: string; icon: LucideIcon; valueClassName?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-secondary px-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">{label}</div>
        <div className={clsx('text-sm font-medium text-text-primary', valueClassName ?? 'truncate')}>{value}</div>
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

export function ProjectView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projects = useAppStore(state => state.projects)
  const tasks = useAppStore(state => state.tasks)
  const settings = useAppStore(state => state.settings)
  const loadData = useAppStore(state => state.loadData)
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false)

  const project = projects.find(p => p.id === id)
  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-tertiary">
        Project not found.
      </div>
    )
  }

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
            <ProjectMark className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold text-text-primary">{project.name}</h1>
                {hasText(project.status) && (
                  <Badge variant="secondary" className="border-status-active/20 bg-status-active/10 text-status-active">
                    {project.status.replace(/-/g, ' ')}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
        {project.boardId && (
          <div className="shrink-0 flex items-center gap-2 rounded-none border border-accent bg-surface-secondary p-1">
            <Button type="button" variant={isProjectSettingsOpen ? 'secondary' : 'ghost'} className="gap-2" onClick={() => setIsProjectSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
              Settings
            </Button>
            <Button type="button" variant="ghost" className="gap-2" onClick={() => navigate(`/boards/${project.boardId}`)}>
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
            {hasText(project.codebaseRoot) && <ProjectMeta label="Codebase" value={project.codebaseRoot} icon={File} valueClassName="break-all" />}
            {hasText(project.budget) && <ProjectMeta label="Budget" value={project.budget} icon={CircleDollarSign} />}
            {hasText(project.deadline) && <ProjectMeta label="Deadline" value={project.deadline} icon={CalendarDays} />}
            {hasText(project.status) && <ProjectMeta label="Status" value={project.status.replace(/-/g, ' ')} icon={Clock} />}
          </div>
        </Card>
      )}

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
