import React, { useState } from 'react'
import { CalendarClock, Repeat2, X } from 'lucide-react'

import { relayhqApi } from '../../api/client'
import { useAppStore } from '../../store/appStore'
import { TaskPriority } from '../../types'
import { Button } from '../ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay, DialogPanel, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Select } from '../ui/select'
import { Textarea } from '../ui/textarea'

type ScheduleMode = 'one-time' | 'recurring'

function parseList(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
}

function toDateTimeLocalValue(date = new Date()) {
  const next = new Date(date)
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`
}

function buildDefaultRunAt() {
  const next = new Date()
  next.setDate(next.getDate() + 1)
  next.setHours(9, 0, 0, 0)
  return toDateTimeLocalValue(next)
}

export function NewScheduledTaskModal() {
  const isOpen = useAppStore(state => state.isNewScheduledTaskModalOpen)
  const closeModal = useAppStore(state => state.closeNewScheduledTaskModal)
  const fetchReadModel = useAppStore(state => state.fetchReadModel)
  const projects = useAppStore(state => state.projects)
  const agents = useAppStore(state => state.agents)
  const columns = useAppStore(state => state.columns)
  const selectedProjectId = useAppStore(state => state.selectedProjectId)

  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('')
  const [contextFiles, setContextFiles] = useState('')
  const [constraints, setConstraints] = useState('')
  const [projectId, setProjectId] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [routingMode, setRoutingMode] = useState<'manual' | 'capability'>('manual')
  const [requiredCapability, setRequiredCapability] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('one-time')
  const [nextRunAtInput, setNextRunAtInput] = useState(buildDefaultRunAt())
  const [cronSchedule, setCronSchedule] = useState('0 9 * * 1-5')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const selectedProject = projects.find((project) => project.id === projectId)
  const availableCapabilities = [...new Set(agents.flatMap((agent) => agent.capabilities ?? []))].sort()
  const acceptanceCriteriaCount = parseList(acceptanceCriteria).length
  const contextFilesCount = parseList(contextFiles).length

  React.useEffect(() => {
    if (!isOpen) return

    if (selectedProjectId) {
      setProjectId(selectedProjectId)
    } else if (!projectId && projects[0]) {
      setProjectId(projects[0].id)
    }

    if (!assigneeId && agents[0]) {
      setAssigneeId(agents[0].id)
    }
  }, [agents, assigneeId, isOpen, projectId, projects, selectedProjectId])

  if (!isOpen) return null

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedProject?.boardId) return

    const todoColumnId = columns.find((column) => column.boardId === selectedProject.boardId && column.position === 0)?.id
    if (!todoColumnId) {
      setSubmitError('Unable to resolve the default board column for this project.')
      return
    }

    if (scheduleMode === 'one-time') {
      const nextRunAt = new Date(nextRunAtInput)
      if (Number.isNaN(nextRunAt.getTime())) {
        setSubmitError('Choose a valid run time.')
        return
      }
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const created = await relayhqApi.createTask({
        title,
        projectId,
        boardId: selectedProject.boardId,
        columnId: todoColumnId,
        priority,
        ...(routingMode === 'manual' ? { assignee: assigneeId } : {}),
        ...(routingMode === 'capability' ? { requiredCapability } : {}),
        objective,
        acceptanceCriteria: parseList(acceptanceCriteria),
        contextFiles: parseList(contextFiles),
        constraints: parseList(constraints),
        ...(scheduleMode === 'recurring' ? { cron_schedule: cronSchedule.trim() } : {}),
      })

      if (scheduleMode === 'one-time') {
        await relayhqApi.scheduleTask(created.taskId, {
          actorId: 'relayhq-web',
          nextRunAt: new Date(nextRunAtInput).toISOString(),
          reason: 'Scheduled task created from the scheduled task modal.',
        })
      }

      await fetchReadModel()
      closeModal()
      setTitle('')
      setObjective('')
      setAcceptanceCriteria('')
      setContextFiles('')
      setConstraints('')
      setPriority('medium')
      setRoutingMode('manual')
      setRequiredCapability('')
      setScheduleMode('one-time')
      setNextRunAtInput(buildDefaultRunAt())
      setCronSchedule('0 9 * * 1-5')
      setSubmitError(null)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to create scheduled task.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) closeModal() }}>
      <DialogOverlay onClick={closeModal} />
      <DialogContent>
        <DialogPanel className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Scheduled Task</DialogTitle>
            <Button variant="ghost" size="icon" onClick={closeModal}>
              <X className="w-5 h-5" />
            </Button>
          </DialogHeader>

          <DialogBody>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setScheduleMode('one-time')}
                  className={`flex items-center justify-center gap-2 rounded-none border px-4 py-3 text-sm transition-colors ${scheduleMode === 'one-time' ? 'border-brand bg-brand-muted text-brand' : 'border-border bg-surface-secondary text-text-secondary hover:text-text-primary'}`}
                >
                  <CalendarClock className="h-4 w-4" /> One-time
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleMode('recurring')}
                  className={`flex items-center justify-center gap-2 rounded-none border px-4 py-3 text-sm transition-colors ${scheduleMode === 'recurring' ? 'border-brand bg-brand-muted text-brand' : 'border-border bg-surface-secondary text-text-secondary hover:text-text-primary'}`}
                >
                  <Repeat2 className="h-4 w-4" /> Recurring
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-primary">Title *</label>
                <Input required autoFocus type="text" value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Daily support triage" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-primary">Objective</label>
                <Textarea value={objective} onChange={event => setObjective(event.target.value)} rows={4} placeholder="Describe what should happen when this scheduled task runs." />
              </div>

              {scheduleMode === 'one-time' ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-primary">Run at</label>
                  <Input type="datetime-local" value={nextRunAtInput} onChange={event => setNextRunAtInput(event.target.value)} />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-primary">Cron schedule</label>
                  <Input value={cronSchedule} onChange={event => setCronSchedule(event.target.value)} placeholder="0 9 * * 1-5" />
                  <p className="text-xs text-text-tertiary">Recurring tasks are created as scheduled and get their next run time automatically from the cron expression.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-primary">Project *</label>
                  <Select value={projectId} onChange={event => setProjectId(event.target.value)}>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-primary">Priority</label>
                  <Select value={priority} onChange={event => setPriority(event.target.value as TaskPriority)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-text-primary">Routing</label>
                  <Select value={routingMode} onChange={event => setRoutingMode(event.target.value as 'manual' | 'capability')}>
                    <option value="manual">Manual assignee</option>
                    <option value="capability">Auto-route by capability</option>
                  </Select>
                </div>
                {routingMode === 'manual' ? (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text-primary">Assignee</label>
                    <Select value={assigneeId} onChange={event => setAssigneeId(event.target.value)}>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>{agent.name}</option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-text-primary">Required capability</label>
                    <Select value={requiredCapability} onChange={event => setRequiredCapability(event.target.value)}>
                      <option value="">Select capability</option>
                      {availableCapabilities.map((capability) => (
                        <option key={capability} value={capability}>{capability}</option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
                Acceptance criteria
                <Textarea value={acceptanceCriteria} onChange={event => setAcceptanceCriteria(event.target.value)} rows={4} placeholder={"One outcome per line\nTask shows in Scheduler\nAssigned agent can execute it"} />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
                Context files
                <Textarea value={contextFiles} onChange={event => setContextFiles(event.target.value)} rows={3} placeholder={"One file or directory per line\napp/server/api/\nweb/src/pages/SchedulerView.tsx"} />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
                Constraints (optional)
                <Textarea value={constraints} onChange={event => setConstraints(event.target.value)} rows={3} placeholder={"One constraint per line\nDo not break the current notification flow"} />
              </label>

              {submitError ? <div className="text-sm text-status-blocked">{submitError}</div> : null}

              <DialogFooter className="px-0 pb-0">
                <Button variant="outline" onClick={closeModal}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting || title.trim().length === 0 || objective.trim().length < 20 || acceptanceCriteriaCount < 1 || contextFilesCount < 1 || (routingMode === 'manual' ? assigneeId.length === 0 : requiredCapability.length === 0) || (scheduleMode === 'recurring' ? cronSchedule.trim().length === 0 : nextRunAtInput.trim().length === 0)}>
                  {isSubmitting ? 'Creating…' : scheduleMode === 'recurring' ? 'Create Recurring Task' : 'Create Scheduled Task'}
                </Button>
              </DialogFooter>
            </form>
          </DialogBody>
        </DialogPanel>
      </DialogContent>
    </Dialog>
  )
}
