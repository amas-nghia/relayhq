import { Suspense, lazy, useState } from 'react';
import { useAppStore } from '../store/appStore';
import { TaskCard } from '../components/task/TaskCard';
import { TaskStatus } from '../types';
import { Plus, LayoutGrid, Globe } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';

const WorldCanvas = lazy(async () => ({ default: (await import('../components/live-world/WorldCanvas')).WorldCanvas }));

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'TODO' },
  { id: 'in-progress', label: 'IN PROGRESS' },
  { id: 'waiting-approval', label: 'REVIEW' },
  { id: 'done', label: 'DONE' }
];

export function BoardView() {
  const tasks = useAppStore(state => state.tasks);
  const selectedProjectId = useAppStore(state => state.selectedProjectId);
  const setSelectedProjectId = useAppStore(state => state.setSelectedProjectId);
  const projects = useAppStore(state => state.projects);
  const openNewTaskModal = useAppStore(state => state.openNewTaskModal);
  const activeAgentsCount = useAppStore(state => state.agents.filter(a => a.state === 'active').length);
  const [viewMode, setViewMode] = useState<'board' | 'world'>('board');
  const visibleTaskCount = selectedProjectId
    ? tasks.filter(task => task.projectId === selectedProjectId).length
    : tasks.length;

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
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <div className="shrink-0 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
            <h1 className="text-2xl font-bold text-text-primary">Main Board</h1>
            <span className="hidden text-text-tertiary sm:inline-block">•</span>
            <Select
              value={selectedProjectId ?? ''}
              onChange={(event) => setSelectedProjectId(event.target.value || null)}
              className="w-auto min-w-48"
            >
              <option value="">All Projects</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </Select>
            <span className="hidden text-text-tertiary sm:inline-block">•</span>
            <Badge variant="secondary" className="border-brand/15 bg-brand-muted text-text-secondary">
              {visibleTaskCount} tasks
            </Badge>
            <span className="hidden text-text-tertiary sm:inline-block">•</span>
            <span className="text-status-active">{activeAgentsCount} agents active</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border bg-surface-secondary p-0.5">
              <Button
                type="button"
                variant={viewMode === 'board' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('board')}
                className={clsx('h-8 w-8 rounded-md', viewMode === 'board' ? 'bg-surface text-brand shadow-sm' : 'text-text-tertiary hover:text-text-secondary')}
                title="Board View"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant={viewMode === 'world' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('world')}
                className={clsx('h-8 w-8 rounded-md', viewMode === 'world' ? 'bg-surface text-brand shadow-sm' : 'text-text-tertiary hover:text-text-secondary')}
                title="World View"
              >
                <Globe className="h-4 w-4" />
              </Button>
            </div>

          </div>
        </div>

        <Button
          type="button"
          onClick={openNewTaskModal}
          className="self-start shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>New Task</span>
        </Button>
      </div>

      {viewMode === 'world' ? (
        <Suspense fallback={<div className="flex min-h-[420px] flex-1 items-center justify-center rounded-xl border border-border bg-surface text-sm text-text-secondary">Loading world…</div>}>
          <WorldCanvas />
        </Suspense>
      ) : (
        <div className="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map(col => {
              const colTasks = getTasksByStatus(col.id);
              return (
                <Card key={col.id} className="flex h-full min-h-0 flex-col overflow-hidden p-4">
                  <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                      {col.label} <Badge variant="secondary" className="ml-1 border-brand/15 bg-brand-muted text-text-tertiary">{colTasks.length}</Badge>
                    </h3>
                    {col.id === 'todo' && (
                      <Button
                        type="button"
                        onClick={openNewTaskModal}
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    )}
                  </div>
                  
                  <div className="lane-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                    {colTasks.length === 0 ? (
                      <div className="flex min-h-[160px] flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface-secondary/60 p-4 text-center">
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
                  </div>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
