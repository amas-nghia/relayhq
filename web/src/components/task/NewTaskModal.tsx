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
  const selectedProject = projects.find(project => project.id === projectId)
  const availableCapabilities = [...new Set(agents.flatMap(agent => agent.capabilities ?? []))].sort()
  const acceptanceCriteriaCount = acceptanceCriteria.split(/\r?\n/).map(item => item.trim()).filter(Boolean).length
  const contextFilesCount = contextFiles.split(/\r?\n/).map(item => item.trim()).filter(Boolean).length

  const builtInTemplates = [
    {
      name: 'Fix Bug',
      title: 'Fix production bug',
      objective: 'Resolve the reported bug and preserve the existing happy path behaviour.',
      acceptanceCriteria: 'Bug is reproducible before the fix\nBug is no longer reproducible after the fix\nRegression path is covered by tests',
      contextFiles: 'app/server/api/\nweb/src/pages/',
      constraints: 'Do not break the current API contract',
    },
    {
      name: 'Write Tests',
      title: 'Add regression coverage',
      objective: 'Add targeted automated tests that catch the reported regression and prove the current flow.',
      acceptanceCriteria: 'New tests fail before the change\nNew tests pass after the change',
      contextFiles: 'app/server/api/\napp/server/services/',
      constraints: 'Prefer focused regression coverage over broad rewrites',
    },
    {
      name: 'Code Review',
      title: 'Review a risky change',
      objective: 'Inspect the target change for regressions, security issues, and missing test coverage.',
      acceptanceCriteria: 'Findings are prioritized by severity\nEach finding has file references',
      contextFiles: 'README.md\ndocs/',
      constraints: 'Focus on bugs and risks before style comments',
    },
    {
      name: 'Research Spike',
      title: 'Research implementation options',
      objective: 'Compare realistic implementation approaches and document the trade-offs clearly.',
      acceptanceCriteria: 'At least two options are compared\nRecommendation is evidence-based',
      contextFiles: 'docs/\napp/server/',
      constraints: 'Do not build production code during the spike',
    },
    {
      name: 'Refactor Module',
      title: 'Refactor a module safely',
      objective: 'Improve the target module structure without changing user-visible behaviour.',
      acceptanceCriteria: 'Behaviour stays unchanged\nComplexity is reduced\nTests still pass',
      contextFiles: 'web/src/\napp/server/',
      constraints: 'Prefer small, reviewable refactors',
    },
    {
      name: 'Write Docs',
      title: 'Write implementation docs',
      objective: 'Document the feature or workflow clearly enough for another engineer or agent to execute it.',
      acceptanceCriteria: 'Docs explain what and why\nExamples are included',
      contextFiles: 'docs/\nREADME.md',
      constraints: 'Keep docs grounded in the implemented behaviour',
    },
  ] as const

  React.useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id)
    if (!assigneeId && agents[0]) setAssigneeId(agents[0].id)
  }, [projects, agents, projectId, assigneeId])

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
  };

  const applyTemplate = (name: string) => {
    const template = builtInTemplates.find(entry => entry.name === name)
    if (!template) return
    setTemplateName(name)
    setTitle(template.title)
    setObjective(template.objective)
    setAcceptanceCriteria(template.acceptanceCriteria)
    setContextFiles(template.contextFiles)
    setConstraints(template.constraints)
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
              <Select value={templateName} onChange={e => applyTemplate(e.target.value)}>
                <option value="">Skip template</option>
                {builtInTemplates.map(template => (
                  <option key={template.name} value={template.name}>{template.name}</option>
                ))}
              </Select>
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
