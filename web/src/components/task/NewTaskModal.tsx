import { useAppStore } from '../../store/appStore';
import { X } from 'lucide-react';
import React, { useState } from 'react';
import { TaskPriority } from '../../types';
import { relayhqApi, type RelayHQVaultFileEntry } from '../../api/client';
import { Button } from '../ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogOverlay, DialogPanel, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Textarea } from '../ui/textarea';

const builtInTemplates = [
  {
    id: 'fix-bug',
    name: 'Fix Bug',
    title: 'Fix production bug',
    objective: 'Resolve the reported bug and preserve the existing happy path behaviour.',
    acceptanceCriteria: ['Bug is reproducible before the fix', 'Bug is no longer reproducible after the fix', 'Regression path is covered by tests'],
    contextFiles: ['app/server/api/', 'web/src/pages/'],
    constraints: ['Do not break the current API contract'],
  },
  {
    id: 'write-tests',
    name: 'Write Tests',
    title: 'Add regression coverage',
    objective: 'Add targeted automated tests that catch the reported regression and prove the current flow.',
    acceptanceCriteria: ['New tests fail before the change', 'New tests pass after the change'],
    contextFiles: ['app/server/api/', 'app/server/services/'],
    constraints: ['Prefer focused regression coverage over broad rewrites'],
  },
  {
    id: 'code-review',
    name: 'Code Review',
    title: 'Review a risky change',
    objective: 'Inspect the target change for regressions, security issues, and missing test coverage.',
    acceptanceCriteria: ['Findings are prioritized by severity', 'Each finding has file references'],
    contextFiles: ['README.md', 'docs/'],
    constraints: ['Focus on bugs and risks before style comments'],
  },
  {
    id: 'research-spike',
    name: 'Research Spike',
    title: 'Research implementation options',
    objective: 'Compare realistic implementation approaches and document the trade-offs clearly.',
    acceptanceCriteria: ['At least two options are compared', 'Recommendation is evidence-based'],
    contextFiles: ['docs/', 'app/server/'],
    constraints: ['Do not build production code during the spike'],
  },
] as const

type ModalTemplate = {
  id: string
  name: string
  title: string
  objective: string
  acceptanceCriteria: ReadonlyArray<string>
  contextFiles: ReadonlyArray<string>
  constraints: ReadonlyArray<string>
}

function mergeTemplates(customTemplates: ReadonlyArray<ModalTemplate>) {
  const merged = new Map<string, ModalTemplate>()

  for (const template of builtInTemplates) {
    merged.set(template.id, template)
  }

  for (const template of customTemplates) {
    merged.set(template.id, template)
  }

  return [...merged.values()]
}

function parseList(value: string) {
  return value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
}

function joinList(items: ReadonlyArray<string>) {
  return items.join('\n')
}

export function NewTaskModal() {
  const isNewTaskModalOpen = useAppStore(state => state.isNewTaskModalOpen);
  const closeNewTaskModal = useAppStore(state => state.closeNewTaskModal);
  const addTask = useAppStore(state => state.addTask);
  const isMutating = useAppStore(state => state.isMutating);
  const projects = useAppStore(state => state.projects);
  const agents = useAppStore(state => state.agents);

  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [contextFiles, setContextFiles] = useState('');
  const [constraints, setConstraints] = useState('');
  const [cronSchedule, setCronSchedule] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [routingMode, setRoutingMode] = useState<'manual' | 'capability'>('manual')
  const [requiredCapability, setRequiredCapability] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [saveTemplateOnCreate, setSaveTemplateOnCreate] = useState(false)
  const [templates, setTemplates] = useState<ReadonlyArray<ModalTemplate>>(builtInTemplates)
  const [isVaultFilePickerOpen, setIsVaultFilePickerOpen] = useState(false)
  const [vaultFiles, setVaultFiles] = useState<ReadonlyArray<RelayHQVaultFileEntry>>([])
  const [isLoadingVaultFiles, setIsLoadingVaultFiles] = useState(false)
  const [vaultFileSearch, setVaultFileSearch] = useState('')
  const [pickerSelection, setPickerSelection] = useState<ReadonlyArray<string>>([])
  const selectedProject = projects.find(project => project.id === projectId)
  const availableCapabilities = [...new Set(agents.flatMap(agent => agent.capabilities ?? []))].sort()
  const acceptanceCriteriaCount = parseList(acceptanceCriteria).length
  const contextFileList = parseList(contextFiles)
  const contextFilesCount = contextFileList.length

  React.useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id)
    if (!assigneeId && agents[0]) setAssigneeId(agents[0].id)
  }, [projects, agents, projectId, assigneeId])

  React.useEffect(() => {
    if (!isNewTaskModalOpen) return

    let cancelled = false
    void relayhqApi.listTaskTemplates()
      .then((response) => {
        if (cancelled) return
        setTemplates(mergeTemplates(response.data))
      })
      .catch(() => {
        if (!cancelled) {
          setTemplates(builtInTemplates)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isNewTaskModalOpen])

  React.useEffect(() => {
    if (!isVaultFilePickerOpen) return

    let cancelled = false
    setIsLoadingVaultFiles(true)

    void relayhqApi.listVaultFiles()
      .then((response) => {
        if (!cancelled) {
          setVaultFiles(response)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingVaultFiles(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isVaultFilePickerOpen])

  if (!isNewTaskModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await addTask({
      title,
      description: objective,
      objective,
      acceptanceCriteria: parseList(acceptanceCriteria),
      contextFiles: parseList(contextFiles),
      constraints: parseList(constraints),
      projectId,
      boardId: selectedProject?.boardId,
      ...(routingMode === 'manual' ? { assigneeId } : {}),
      ...(routingMode === 'capability' ? { requiredCapability } : {}),
      ...(cronSchedule.trim().length > 0 ? { cronSchedule: cronSchedule.trim() } : {}),
      priority,
    });

    if (saveTemplateOnCreate) {
      await relayhqApi.createTaskTemplate({
        name: title.trim() || 'Custom Template',
        title,
        objective,
        acceptanceCriteria,
        contextFiles,
        constraints,
      })

      const response = await relayhqApi.listTaskTemplates()
      setTemplates(mergeTemplates(response.data))
    }

    closeNewTaskModal();
    setTitle('');
    setObjective('');
    setAcceptanceCriteria('');
    setContextFiles('');
    setConstraints('');
    setCronSchedule('');
    setPriority('medium');
    setSelectedTemplateId('')
    setSaveTemplateOnCreate(false)
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find(entry => entry.id === templateId)
    if (!template) return
    setSelectedTemplateId(templateId)
    setTitle(template.title)
    setObjective(template.objective)
    setAcceptanceCriteria(template.acceptanceCriteria.join('\n'))
    setContextFiles(template.contextFiles.join('\n'))
    setConstraints(template.constraints.join('\n'))
  }

  const clearTemplateSelection = () => {
    setSelectedTemplateId('')
    setTitle('')
    setObjective('')
    setAcceptanceCriteria('')
    setContextFiles('')
    setConstraints('')
  }

  const openVaultFilePicker = () => {
    setPickerSelection(contextFileList)
    setVaultFileSearch('')
    setIsVaultFilePickerOpen(true)
  }

  const applyVaultFilePicker = () => {
    setContextFiles(joinList(pickerSelection))
    setIsVaultFilePickerOpen(false)
  }

  const filteredVaultFiles = vaultFiles.filter(file => {
    const query = vaultFileSearch.trim().toLowerCase()
    if (query.length === 0) return true
    return file.path.toLowerCase().includes(query) || file.label.toLowerCase().includes(query) || file.kind.toLowerCase().includes(query)
  })

  return (
    <Dialog open={isNewTaskModalOpen}>
      <DialogOverlay onClick={closeNewTaskModal} />
      <DialogContent>
        <DialogPanel className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
            <Button variant="ghost" size="icon" onClick={closeNewTaskModal}>
              <X className="w-5 h-5" />
            </Button>
          </DialogHeader>

          <DialogBody>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Template</label>
              <Select
                value={selectedTemplateId}
                onChange={event => {
                  const templateId = event.target.value
                  if (!templateId) {
                    clearTemplateSelection()
                    return
                  }

                  applyTemplate(templateId)
                }}
              >
                <option value="">Blank</option>
                <optgroup label="Built-in">
                  {builtInTemplates.map(template => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </optgroup>
                {templates.some(template => !builtInTemplates.some(item => item.id === template.id)) && (
                  <optgroup label="Saved">
                    {templates.filter(template => !builtInTemplates.some(item => item.id === template.id)).map(template => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-primary">Title *</label>
            <Input 
              required
              autoFocus
              type="text" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Deploy API to Production"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-primary">Objective</label>
            <Textarea 
              value={objective}
              onChange={e => setObjective(e.target.value)}
              rows={4}
              placeholder="Describe what this task should achieve in enough detail for an agent or teammate to start immediately."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-primary">Cron schedule</label>
            <Input
              value={cronSchedule}
              onChange={e => setCronSchedule(e.target.value)}
              placeholder="0 9 * * 1-5"
            />
            <p className="text-xs text-text-tertiary">Optional 5-field cron expression. Recurring tasks are created as scheduled and re-spawned after completion.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Project *</label>
              <Select 
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Board *</label>
              <Select>
                <option>{selectedProject ? `${selectedProject.name} Board` : 'Project Board'}</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Priority</label>
              <Select 
                value={priority}
                onChange={e => setPriority(e.target.value as TaskPriority)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Routing</label>
              <Select value={routingMode} onChange={e => setRoutingMode(e.target.value as 'manual' | 'capability')}>
                <option value="manual">Manual assignee</option>
                <option value="capability">Auto-route by capability</option>
              </Select>
            </div>
          </div>

          {routingMode === 'manual' ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Assignee</label>
              <Select 
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Required capability</label>
              <Select value={requiredCapability} onChange={e => setRequiredCapability(e.target.value)}>
                <option value="">Select capability</option>
                {availableCapabilities.map(capability => (
                  <option key={capability} value={capability}>{capability}</option>
                ))}
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
              Acceptance criteria
              <Textarea
                value={acceptanceCriteria}
                onChange={e => setAcceptanceCriteria(e.target.value)}
                rows={4}
                placeholder={"One outcome per line\nTask appears on the board\nReviewer can verify the result"}
              />
            </label>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-text-primary">Context files</label>
                <Button type="button" variant="outline" size="sm" onClick={openVaultFilePicker}>
                  Choose from vault
                </Button>
              </div>
              {contextFileList.length > 0 ? (
                <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface-secondary p-2">
                  {contextFileList.map(file => (
                    <button
                      key={file}
                      type="button"
                      onClick={() => setContextFiles(joinList(contextFileList.filter(item => item !== file)))}
                      className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
                    >
                      {file}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
                  No context files selected.
                </div>
              )}
            </div>
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
            Constraints (optional)
            <Textarea
              value={constraints}
              onChange={e => setConstraints(e.target.value)}
              rows={3}
              placeholder={"One constraint per line\nDo not break existing approval flow"}
            />
          </label>

          <p className="text-xs text-text-tertiary">
            New tasks should include a real objective, at least two acceptance criteria, and at least one context file.
          </p>

            <DialogFooter className="items-end px-0 pb-0">
              <div className="mr-auto flex items-center gap-2 text-sm text-text-secondary">
                <input
                  id="save-template-on-create"
                  type="checkbox"
                  checked={saveTemplateOnCreate}
                  onChange={event => setSaveTemplateOnCreate(event.target.checked)}
                />
                <label htmlFor="save-template-on-create">Save this task as a template</label>
              </div>
              <Button variant="outline" onClick={closeNewTaskModal}>Cancel</Button>
              <Button type="submit" disabled={isMutating || title.trim().length === 0 || objective.trim().length < 50 || acceptanceCriteriaCount < 2 || contextFilesCount < 1 || (routingMode === 'manual' ? assigneeId.length === 0 : requiredCapability.length === 0)}>{isMutating ? 'Creating...' : 'Create Task'}</Button>
            </DialogFooter>
            </form>
          </DialogBody>
        </DialogPanel>
      </DialogContent>
      {isVaultFilePickerOpen && (
        <Dialog open>
          <DialogOverlay onClick={() => setIsVaultFilePickerOpen(false)} />
          <DialogContent>
            <DialogPanel className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Choose vault files</DialogTitle>
                <Button variant="ghost" size="icon" onClick={() => setIsVaultFilePickerOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </DialogHeader>
              <DialogBody>
                <div className="flex flex-col gap-4">
                  <Input value={vaultFileSearch} onChange={event => setVaultFileSearch(event.target.value)} placeholder="Search vault files…" />
                  <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-surface-secondary p-2">
                    {isLoadingVaultFiles ? (
                      <div className="px-3 py-6 text-sm text-text-tertiary">Loading files…</div>
                    ) : filteredVaultFiles.length === 0 ? (
                      <div className="px-3 py-6 text-sm text-text-tertiary">No files found.</div>
                    ) : (
                      <div className="space-y-1">
                        {filteredVaultFiles.map(file => {
                          const checked = pickerSelection.includes(file.path)
                          return (
                            <label key={file.path} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-surface">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setPickerSelection(current => current.includes(file.path) ? current.filter(item => item !== file.path) : [...current, file.path])
                                }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-text-primary">{file.label}</span>
                                <span className="block truncate text-xs text-text-tertiary">{file.path}</span>
                              </span>
                              <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-text-tertiary">{file.kind}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsVaultFilePickerOpen(false)}>Cancel</Button>
                <Button type="button" onClick={applyVaultFilePicker}>Use selected files</Button>
              </DialogFooter>
            </DialogPanel>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
