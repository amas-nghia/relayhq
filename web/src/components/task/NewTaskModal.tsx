import { useAppStore } from '../../store/appStore';
import { X } from 'lucide-react';
import React, { useState } from 'react';
import { TaskPriority } from '../../types';
import { relayhqApi } from '../../api/client';
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

export function NewTaskModal() {
  const isNewTaskModalOpen = useAppStore(state => state.isNewTaskModalOpen);
  const closeNewTaskModal = useAppStore(state => state.closeNewTaskModal);
  const addTask = useAppStore(state => state.addTask);
  const isMutating = useAppStore(state => state.isMutating);
  const mutationError = useAppStore(state => state.mutationError);
  const projects = useAppStore(state => state.projects);
  const agents = useAppStore(state => state.agents);

  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [contextFiles, setContextFiles] = useState('');
  const [constraints, setConstraints] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [routingMode, setRoutingMode] = useState<'manual' | 'capability'>('manual')
  const [requiredCapability, setRequiredCapability] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [templateName, setTemplateName] = useState('')
  const [templates, setTemplates] = useState<ReadonlyArray<ModalTemplate>>(builtInTemplates)
  const selectedProject = projects.find(project => project.id === projectId)
  const availableCapabilities = [...new Set(agents.flatMap(agent => agent.capabilities ?? []))].sort()
  const acceptanceCriteriaCount = acceptanceCriteria.split(/\r?\n/).map(item => item.trim()).filter(Boolean).length
  const contextFilesCount = contextFiles.split(/\r?\n/).map(item => item.trim()).filter(Boolean).length

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
        setTemplates(response.data.length > 0 ? response.data : builtInTemplates)
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

  if (!isNewTaskModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await addTask({
      title,
      description: objective,
      objective,
      acceptanceCriteria: acceptanceCriteria.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
      contextFiles: contextFiles.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
      constraints: constraints.split(/\r?\n/).map(item => item.trim()).filter(Boolean),
      projectId,
      boardId: selectedProject?.boardId,
      ...(routingMode === 'manual' ? { assigneeId } : {}),
      ...(routingMode === 'capability' ? { requiredCapability } : {}),
      priority,
    });
    closeNewTaskModal();
    setTitle('');
    setObjective('');
    setAcceptanceCriteria('');
    setContextFiles('');
    setConstraints('');
    setPriority('medium');
    setTemplateName('')
  };

  const applyTemplate = (name: string) => {
    const template = templates.find(entry => entry.name === name)
    if (!template) return
    setTemplateName(name)
    setTitle(template.title)
    setObjective(template.objective)
    setAcceptanceCriteria(template.acceptanceCriteria.join('\n'))
    setContextFiles(template.contextFiles.join('\n'))
    setConstraints(template.constraints.join('\n'))
  }

  const saveCurrentAsTemplate = async () => {
    await relayhqApi.createTaskTemplate({
      name: templateName.trim() || title.trim() || 'Custom Template',
      title,
      objective,
      acceptanceCriteria,
      contextFiles,
      constraints,
    })
    const response = await relayhqApi.listTaskTemplates()
    setTemplates(response.data.length > 0 ? response.data : builtInTemplates)
  }

  const clearTemplateSelection = () => {
    setTemplateName('')
    setTitle('')
    setObjective('')
    setAcceptanceCriteria('')
    setContextFiles('')
    setConstraints('')
  }

  return (
    <Dialog open={isNewTaskModalOpen}>
      <DialogOverlay />
      <DialogContent>
        <DialogPanel className="max-w-lg" onClick={e => e.stopPropagation()}>
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
              <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface-secondary p-2">
                <Button type="button" variant={templateName.length === 0 ? 'default' : 'outline'} size="sm" onClick={clearTemplateSelection}>
                  Blank
                </Button>
                {templates.map(template => (
                  <Button
                    key={template.id}
                    type="button"
                    variant={templateName === template.name ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => applyTemplate(template.name)}
                  >
                    {template.name}
                  </Button>
                ))}
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => void saveCurrentAsTemplate()}>
              Save as template
            </Button>
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

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
              Acceptance criteria
              <Textarea
                value={acceptanceCriteria}
                onChange={e => setAcceptanceCriteria(e.target.value)}
                rows={4}
                placeholder={"One outcome per line\nTask appears on the board\nReviewer can verify the result"}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-text-primary">
              Context files
              <Textarea
                value={contextFiles}
                onChange={e => setContextFiles(e.target.value)}
                rows={4}
                placeholder={"One path per line\nweb/src/api/client.ts\ndocs/onboarding.md"}
              />
            </label>
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

            <DialogFooter className="px-0 pb-0">
              {mutationError && <p className="mr-auto text-sm text-status-blocked">{mutationError}</p>}
              <Button variant="outline" onClick={closeNewTaskModal}>Cancel</Button>
              <Button type="submit" disabled={isMutating || title.trim().length === 0 || objective.trim().length < 50 || acceptanceCriteriaCount < 2 || contextFilesCount < 1 || (routingMode === 'manual' ? assigneeId.length === 0 : requiredCapability.length === 0)}>{isMutating ? 'Creating...' : 'Create Task'}</Button>
            </DialogFooter>
            </form>
          </DialogBody>
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}
