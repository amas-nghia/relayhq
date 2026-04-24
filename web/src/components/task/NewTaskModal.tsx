import { useAppStore } from '../../store/appStore';
import { X } from 'lucide-react';
import React, { useState } from 'react';
import { Task, TaskPriority } from '../../types';

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
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div 
        className="bg-surface rounded-xl shadow-modal w-full max-w-lg overflow-hidden flex flex-col transform transition-all animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold text-text-primary">New Task</h2>
          <button onClick={closeNewTaskModal} className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-secondary rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-primary">Title *</label>
            <input 
              required
              autoFocus
              type="text" 
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="px-3 py-2 bg-surface-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent w-full transition-all"
              placeholder="e.g. Deploy API to Production"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-primary">Description</label>
            <textarea 
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="px-3 py-2 bg-surface-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent w-full resize-none transition-all"
              placeholder="Task details..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Project *</label>
              <select 
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="px-3 py-2 bg-surface-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent w-full transition-all"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Board *</label>
              <select className="px-3 py-2 bg-surface-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent w-full transition-all">
                <option>{selectedProject ? `${selectedProject.name} Board` : 'Project Board'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Priority</label>
              <select 
                value={priority}
                onChange={e => setPriority(e.target.value as TaskPriority)}
                className="px-3 py-2 bg-surface-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent w-full transition-all"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Assignee</label>
              <select 
                value={assigneeId}
                onChange={e => setAssigneeId(e.target.value)}
                className="px-3 py-2 bg-surface-secondary border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent w-full transition-all"
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
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

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
            <button 
              type="button" 
              onClick={closeNewTaskModal}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-secondary rounded-md border border-transparent transition-colors"
            >
              Cancel
            </button>
            {mutationError && <p className="text-sm text-status-blocked">{mutationError}</p>}
            <button 
              type="submit"
              disabled={isMutating}
              className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent/90 focus:ring-2 focus:ring-accent/50 focus:outline-none rounded-md transition-colors"
            >
              {isMutating ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
