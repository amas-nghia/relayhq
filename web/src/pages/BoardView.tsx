import { type DragEvent, useRef, useState } from 'react';

import { useAppStore } from '../store/appStore';
import { TaskCard } from '../components/task/TaskCard';
import { Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { resolveBoardDrop, type BoardLaneId } from './boardDrop';

const COLUMNS: { id: BoardLaneId; label: string }[] = [
  { id: 'todo', label: 'TODO' },
  { id: 'scheduled', label: 'SCHEDULED' },
  { id: 'in-progress', label: 'IN PROGRESS' },
  { id: 'review', label: 'REVIEW' },
  { id: 'done', label: 'DONE' }
];

export function BoardView() {
  const tasks = useAppStore(state => state.tasks);
  const isLoading = useAppStore(state => state.isLoading);
  const selectedProjectId = useAppStore(state => state.selectedProjectId);
  const setSelectedProjectId = useAppStore(state => state.setSelectedProjectId);
  const projects = useAppStore(state => state.projects);
  const openNewTaskModal = useAppStore(state => state.openNewTaskModal);
  const moveTaskToStatus = useAppStore(state => state.moveTaskToStatus);
  const [activeLane, setActiveLane] = useState<BoardLaneId>('in-progress');
  const [dragOverLane, setDragOverLane] = useState<BoardLaneId | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const laneRefs = useRef<Record<BoardLaneId, HTMLDivElement | null>>({ todo: null, 'in-progress': null, review: null, scheduled: null, done: null });

  const getTasksByStatus = (status: BoardLaneId) => {
    let filteredTasks = tasks;
    if (selectedProjectId) {
      filteredTasks = filteredTasks.filter(t => t.projectId === selectedProjectId);
    }

    if (status === 'in-progress') {
      return filteredTasks
        .filter(t => t.status === 'in-progress' || t.status === 'blocked')
        .sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? '') || right.id.localeCompare(left.id));
    }

    if (status === 'review') {
      return filteredTasks
        .filter(t => t.status === 'review' || t.status === 'waiting-approval')
        .sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? '') || right.id.localeCompare(left.id));
    }

    if (status === 'scheduled') {
      return filteredTasks
        .filter(t => t.status === 'scheduled')
        .sort((left, right) => (left.nextRunAt ?? '').localeCompare(right.nextRunAt ?? '') || right.id.localeCompare(left.id));
    }

    return filteredTasks
      .filter(t => t.status === status)
      .sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? '') || right.id.localeCompare(left.id));
  };

  const handleDrop = async (laneId: BoardLaneId, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOverLane(null);
    setDropHint(null);
    const taskId = event.dataTransfer.getData('application/x-relayhq-task-id') || event.dataTransfer.getData('text/plain');
    if (!taskId) return;

    const task = tasks.find((entry) => entry.id === taskId);
    if (!task) return;

    const next = resolveBoardDrop(laneId, task.status);
    if (!next) {
      if (laneId === 'done' && task.status === 'waiting-approval') {
        setDropHint('This task is waiting approval. Approve it first, then move it to Done.');
      } else if (laneId === 'done') {
        setDropHint('Only review tasks can be dropped into Done.');
      }
      return;
    }

    if (next.status === task.status && next.column === task.columnId) return;

    await moveTaskToStatus(taskId, next.status, task.lockedBy ?? task.assigneeId ?? 'human-user');
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

      {dropHint && (
        <div className="rounded-lg border border-status-waiting/30 bg-status-waiting/10 px-4 py-3 text-sm text-status-waiting">
          {dropHint}
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-1 xl:hidden">
        {COLUMNS.map((column) => (
          <Button
            key={column.id}
            type="button"
            size="sm"
            variant={activeLane === column.id ? 'secondary' : 'ghost'}
            className="whitespace-nowrap"
            onClick={() => {
              setActiveLane(column.id)
              laneRefs.current[column.id]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
            }}
          >
            {column.label}
          </Button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto snap-x snap-mandatory xl:grid xl:auto-rows-[minmax(0,1fr)] xl:grid-cols-5 xl:overflow-visible">
          {COLUMNS.map(col => {
            const colTasks = getTasksByStatus(col.id);
            return (
                <Card
                  key={col.id}
                  ref={(node) => {
                    laneRefs.current[col.id] = node
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragOverLane(col.id);
                  }}
                  onDragLeave={() => setDragOverLane((current) => (current === col.id ? null : current))}
                  onDrop={(event) => void handleDrop(col.id, event)}
                  className={
                    `flex h-full min-h-0 min-w-full snap-start flex-col overflow-hidden p-4 md:min-w-[calc(50%-0.5rem)] xl:min-w-0 ${dragOverLane === col.id ? (col.id === 'done' ? 'border-status-done/50 bg-status-done/10 shadow-[0_0_0_1px_rgba(34,197,94,0.25)]' : 'border-brand/40 bg-brand-muted/20') : ''}`
                  }
                >
                <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                    {col.label} <Badge variant="secondary" className="ml-1 border-brand/15 bg-brand-muted text-text-tertiary">{colTasks.length}</Badge>
                  </h3>
                  {dragOverLane === 'done' && col.id === 'done' && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-status-done">Drop to finish</span>
                  )}
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
                
                <div
                  className="lane-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1"
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverLane(col.id);
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragOverLane(col.id);
                  }}
                  onDrop={(event) => void handleDrop(col.id, event)}
                >
                  {isLoading && tasks.length === 0 ? (
                    <div className="space-y-3">
                      <div className="h-24 rounded-lg border border-dashed border-border bg-surface-secondary/60 animate-pulse" />
                      <div className="h-24 rounded-lg border border-dashed border-border bg-surface-secondary/60 animate-pulse" />
                    </div>
                  ) : colTasks.length === 0 ? (
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
                          transition={{ duration: 0.25, ease: 'easeOut' }}
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
    </div>
  );
}
