import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { TaskCard } from '../components/task/TaskCard';
import { WorldCanvas } from '../components/live-world/WorldCanvas';
import { TaskStatus } from '../types';
import { Plus, LayoutGrid, Globe } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'motion/react';

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'TODO' },
  { id: 'in-progress', label: 'IN PROGRESS' },
  { id: 'waiting-approval', label: 'REVIEW' },
  { id: 'done', label: 'DONE' }
];

export function BoardView() {
  const tasks = useAppStore(state => state.tasks);
  const selectedProjectId = useAppStore(state => state.selectedProjectId);
  const openNewTaskModal = useAppStore(state => state.openNewTaskModal);
  const activeAgentsCount = useAppStore(state => state.agents.filter(a => a.state === 'active').length);
  const [viewMode, setViewMode] = useState<'board' | 'world'>('board');

  const getTasksByStatus = (status: TaskStatus) => {
    let filteredTasks = tasks;
    if (selectedProjectId) {
      filteredTasks = filteredTasks.filter(t => t.projectId === selectedProjectId);
    }

    if (status === 'in-progress') {
      return filteredTasks.filter(t => t.status === 'in-progress' || t.status === 'blocked');
    }
    return filteredTasks.filter(t => t.status === status);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-4 text-sm font-medium">
          <h1 className="text-lg font-bold text-text-primary">Main Board</h1>
          
          <div className="flex bg-surface-secondary border border-border rounded-md p-0.5 ml-2">
            <button 
              onClick={() => setViewMode('board')} 
              className={clsx("p-1.5 rounded", viewMode === 'board' ? "bg-surface text-accent shadow-sm" : "text-text-tertiary hover:text-text-secondary")}
              title="Board View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('world')} 
              className={clsx("p-1.5 rounded", viewMode === 'world' ? "bg-surface text-accent shadow-sm" : "text-text-tertiary hover:text-text-secondary")}
              title="World View"
            >
              <Globe className="w-4 h-4" />
            </button>
          </div>

          <span className="text-text-tertiary hidden sm:inline-block">•</span>
          <span className="text-text-secondary">{tasks.length} tasks</span>
          <span className="text-text-tertiary hidden sm:inline-block">•</span>
          <span className="text-status-active">{activeAgentsCount} agents active</span>
        </div>
        <button 
          onClick={openNewTaskModal}
          className="bg-accent hover:bg-accent/90 text-white text-sm font-medium py-1.5 px-3 rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">New Task</span>
        </button>
      </div>

      {viewMode === 'world' ? (
        <WorldCanvas />
      ) : (
        <div className="flex-1 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex flex-nowrap h-full gap-4 md:gap-6 min-w-max md:min-w-0">
            {COLUMNS.map(col => {
              const colTasks = getTasksByStatus(col.id);
              return (
                <div key={col.id} className="flex flex-col w-72 md:flex-1 shrink-0 bg-transparent h-full">
                  <div className="flex items-center justify-between mb-3 px-1 shrink-0">
                    <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                      {col.label} <span className="text-text-tertiary ml-1 font-medium">{colTasks.length}</span>
                    </h3>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pr-1 pb-2 flex flex-col gap-3 rounded-lg mr-[-4px]">
                    {colTasks.length === 0 ? (
                      <div className="border-2 border-dashed border-border rounded-lg h-32 flex flex-col items-center justify-center p-4 text-center">
                        <span className="text-sm text-text-tertiary">No tasks</span>
                      </div>
                    ) : (
                      <AnimatePresence mode="popLayout" initial={false}>
                        {colTasks.map(task => (
                          <motion.div
                            key={task.id}
                            layout="position"
                            initial={{ opacity: 0, scale: 0.9, y: -20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, x: 20 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                          >
                            <TaskCard task={task} />
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    )}
                    {col.id === 'todo' && (
                      <button 
                        onClick={openNewTaskModal}
                        className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-border/50 py-2 px-3 rounded-lg transition-colors border border-transparent border-dashed hover:border-border mt-1"
                      >
                        <Plus className="w-4 h-4" /> Add task
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
