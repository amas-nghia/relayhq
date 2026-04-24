import { useAppStore } from '../store/appStore';
import { Search, Plus, Filter, Bot, Check, Clock, AlertTriangle, Circle } from 'lucide-react';
import clsx from 'clsx';
import { TaskStatus } from '../types';

export function TasksView() {
  const tasks = useAppStore(state => state.tasks);
  const agents = useAppStore(state => state.agents);
  const projects = useAppStore(state => state.projects);
  const openDetail = useAppStore(state => state.openTaskDetail);
  const openNewTaskModal = useAppStore(state => state.openNewTaskModal);

  const getStatusIcon = (status: TaskStatus) => {
    switch(status) {
      case 'waiting-approval': return <Clock className="w-4 h-4 text-status-waiting" />;
      case 'blocked': return <AlertTriangle className="w-4 h-4 text-status-blocked" />;
      case 'in-progress': return <Circle className="w-4 h-4 text-status-active fill-current" />;
      case 'done': return <Check className="w-4 h-4 text-status-done" />;
      case 'todo': return <Circle className="w-4 h-4 text-text-tertiary" />;
    }
  };

  const getStatusLabel = (status: TaskStatus) => {
    switch(status) {
      case 'waiting-approval': return 'waiting';
      case 'blocked': return 'blocked';
      case 'in-progress': return 'in-prog';
      case 'done': return 'done';
      case 'todo': return 'todo';
    }
  };

  // Sort tasks: urgent first
  const sortedTasks = [...tasks].sort((a, b) => {
    const order = { 'waiting-approval': 0, 'blocked': 1, 'in-progress': 2, 'todo': 3, 'done': 4 };
    return order[a.status] - order[b.status];
  });

  return (
    <div className="flex min-h-full w-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-text-primary">Tasks</h1>
          <button 
            onClick={openNewTaskModal}
            className="inline-flex items-center gap-1.5 self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent/90"
          >
            <Plus className="w-4 h-4" /> New Task
          </button>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] flex items-center gap-2">
            <Search className="w-4 h-4 absolute left-3 text-text-tertiary" />
            <input 
              type="text" 
              placeholder="Search tasks..." 
              className="w-full bg-surface border border-border rounded-md px-3 py-1.5 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent block transition-all"
            />
          </div>
          <button className="bg-surface hover:bg-surface-secondary border border-border text-text-secondary text-sm font-medium px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5">
            Project <Filter className="w-3.5 h-3.5" />
          </button>
          <button className="bg-surface hover:bg-surface-secondary border border-border text-text-secondary text-sm font-medium px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5">
            Status <Filter className="w-3.5 h-3.5" />
          </button>
          <button className="bg-surface hover:bg-surface-secondary border border-border text-text-secondary text-sm font-medium px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5">
            Assignee <Filter className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-lg border border-border bg-surface">
        <div className="h-full overflow-auto">
          <table className="min-w-[860px] w-full border-collapse text-left">
          <thead>
            <tr className="bg-surface-secondary text-xs uppercase tracking-wider text-text-tertiary border-b border-border">
              <th className="px-4 py-3 font-semibold w-10"></th>
              <th className="px-4 py-3 font-semibold w-24">ID</th>
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold w-32">Project</th>
              <th className="px-4 py-3 font-semibold w-24">Status</th>
              <th className="px-4 py-3 font-semibold w-40">Assignee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedTasks.map(task => {
              const project = projects.find(p => p.id === task.projectId);
              const agent = agents.find(a => a.id === task.assigneeId);
              
              return (
                <tr 
                  key={task.id} 
                  onClick={() => openDetail(task.id)}
                  className="hover:bg-surface-secondary/50 transition-colors cursor-pointer group"
                >
                  <td className="px-4 py-3">
                    {getStatusIcon(task.status)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-text-secondary">
                    {task.id}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                    <span className="truncate flex items-center gap-2 max-w-sm xl:max-w-md">
                      {task.title}
                      {task.priority === 'critical' && <span className="text-[10px] text-red-600 bg-red-50 p-0.5 rounded font-bold uppercase ring-1 ring-red-200">Critical</span>}
                      {task.priority === 'high' && <span className="text-[10px] text-amber-600 bg-amber-50 p-0.5 rounded font-bold uppercase ring-1 ring-amber-200">High</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary truncate">
                    {project?.name || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      "text-[11px] font-bold uppercase tracking-wider p-2 rounded",
                      task.status === 'in-progress' && "bg-blue-50 text-status-active",
                      task.status === 'waiting-approval' && "bg-amber-50 text-status-waiting",
                      task.status === 'blocked' && "bg-red-50 text-status-blocked",
                      task.status === 'done' && "bg-green-50 text-status-done",
                      task.status === 'todo' && "bg-slate-100 text-status-todo"
                    )}>
                      {getStatusLabel(task.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {agent ? (
                      <div className="flex items-center gap-1.5 text-sm font-medium text-text-secondary group-hover:text-text-primary transition-colors">
                        <Bot className="w-4 h-4 text-text-tertiary group-hover:text-accent transition-colors" />
                        <span className="truncate">{agent.name}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-text-tertiary">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
