import { useAppStore } from '../../store/appStore';
import { X } from 'lucide-react';
import React, { useState } from 'react';
import { TaskPriority } from '../../types';
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
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const selectedProject = projects.find(project => project.id === projectId)
  const acceptanceCriteriaCount = acceptanceCriteria.split(/\r?\n/).map(item => item.trim()).filter(Boolean).length
  const contextFilesCount = contextFiles.split(/\r?\n/).map(item => item.trim()).filter(Boolean).length

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
      assigneeId,
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
          </div>

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
              <Button type="submit" disabled={isMutating || title.trim().length === 0 || objective.trim().length < 50 || acceptanceCriteriaCount < 2 || contextFilesCount < 1}>{isMutating ? 'Creating...' : 'Create Task'}</Button>
            </DialogFooter>
            </form>
          </DialogBody>
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}
