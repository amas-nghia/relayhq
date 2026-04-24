import { useAppStore } from '../../store/appStore';
import { X } from 'lucide-react';
import React, { useState } from 'react';
import { Task, TaskPriority } from '../../types';
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
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const selectedProject = projects.find(project => project.id === projectId)

  React.useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id)
    if (!assigneeId && agents[0]) setAssigneeId(agents[0].id)
  }, [projects, agents, projectId, assigneeId])

  if (!isNewTaskModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await addTask({ title, description, projectId, boardId: selectedProject?.boardId, assigneeId, priority });
    closeNewTaskModal();
    // Reset form
    setTitle('');
    setDescription('');
    setPriority('medium');
    setRequiresApproval(false);
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
            <label className="text-sm font-medium text-text-primary">Description</label>
            <Textarea 
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Task details..."
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

          <div className="flex flex-col gap-2 mt-1">
            <span className="text-sm font-medium text-text-primary">Requires approval?</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="approval" 
                  checked={!requiresApproval} 
                  onChange={() => setRequiresApproval(false)} 
                  className="w-4 h-4 text-accent border-border focus:ring-accent"
                />
                <span className="text-sm text-text-secondary">No</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input 
                  type="radio" 
                  name="approval" 
                  checked={requiresApproval} 
                  onChange={() => setRequiresApproval(true)} 
                  className="w-4 h-4 text-accent border-border focus:ring-accent"
                />
                <span className="text-sm text-text-secondary">Yes</span>
              </label>
            </div>
          </div>

            <DialogFooter className="px-0 pb-0">
              {mutationError && <p className="mr-auto text-sm text-status-blocked">{mutationError}</p>}
              <Button variant="outline" onClick={closeNewTaskModal}>Cancel</Button>
              <Button type="submit" disabled={isMutating}>{isMutating ? 'Creating...' : 'Create Task'}</Button>
            </DialogFooter>
            </form>
          </DialogBody>
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}
