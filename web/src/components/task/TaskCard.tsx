import { useEffect, useState } from 'react';
import { Bot, Check, Clock3 } from 'lucide-react';
import { Task } from '../../types';
import { relayhqApi } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import clsx from 'clsx';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

function resolveDeferredTime(input: string): string | null {
  const normalized = input.trim().toLowerCase()
  if (normalized === '1h') return new Date(Date.now() + 60 * 60 * 1000).toISOString()
  if (normalized === '4h') return new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
  if (normalized === 'tomorrow 9am' || normalized === 'tomorrow9') {
    const next = new Date()
    next.setDate(next.getDate() + 1)
    next.setHours(9, 0, 0, 0)
    return next.toISOString()
  }

  const parsed = new Date(input)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export function TaskCard({ task }: { task: Task; key?: string | number }) {
  const openDetail = useAppStore(state => state.openTaskDetail);
  const selectedTaskId = useAppStore(state => state.selectedTaskId);
  const agent = useAppStore(state => state.agents.find(a => a.id === task.assigneeId));
  const fetchReadModel = useAppStore(state => state.fetchReadModel);
  const isSelected = selectedTaskId === task.id;
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    if (task.status !== 'scheduled' || !task.nextRunAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, [task.nextRunAt, task.status]);

  const scheduleLabel = (() => {
    if (task.status !== 'scheduled' || !task.nextRunAt) return null;
    const target = new Date(task.nextRunAt).getTime();
    if (Number.isNaN(target)) return 'Scheduled';
    const diffMs = target - Date.now();
    if (diffMs <= 0) return 'Resuming soon';
    const totalMinutes = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `Resumes in ${hours}h ${minutes}m` : `Resumes in ${minutes}m`;
  })();

  const scheduleForLater = async () => {
    const raw = window.prompt('Schedule for later: use 1h, 4h, tomorrow 9am, or an ISO/custom datetime', '1h')
    if (!raw) return
    const nextRunAt = resolveDeferredTime(raw)
    if (!nextRunAt) return
    await relayhqApi.scheduleTask(task.id, { actorId: 'relayhq-web', nextRunAt, reason: 'Scheduled for later by operator' })
    await fetchReadModel()
  }

  const unschedule = async () => {
    await relayhqApi.patchTask(task.id, {
      actorId: 'relayhq-web',
      patch: {
        status: 'todo',
        column: 'todo',
        next_run_at: null,
        blocked_reason: null,
      },
    })
    await fetchReadModel()
  }

  let leftBorderClass = 'border-l-4 border-l-transparent';
  if (task.status === 'blocked') leftBorderClass = 'border-l-4 border-l-status-blocked';
  else if (task.status === 'scheduled') leftBorderClass = 'border-l-4 border-l-text-tertiary';
  else if (task.status === 'review') leftBorderClass = 'border-l-4 border-l-status-active';
  else if (task.status === 'waiting-approval') leftBorderClass = 'border-l-4 border-l-status-waiting';
  else if (task.priority === 'critical') leftBorderClass = 'border-l-4 border-l-status-blocked';
  else if (task.priority === 'high') leftBorderClass = 'border-l-4 border-l-status-waiting';

  let priorityDot = null;
  if (task.priority === 'critical') priorityDot = 'bg-status-blocked';
  if (task.priority === 'high') priorityDot = 'bg-status-waiting';
  if (task.priority === 'low') priorityDot = 'bg-border';

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => openDetail(task.id)}
      className={clsx(
        'group relative flex min-h-[72px] flex-col justify-between p-3 cursor-pointer transition-all duration-150 ease-out hover:-translate-y-[2px] hover:shadow-hover hover:border-brand/30',
        leftBorderClass,
        isSelected && 'ring-2 ring-brand border-brand',
        task.status === 'done' && 'opacity-60 hover:translate-y-0 hover:opacity-100',
        task.status === 'scheduled' && 'opacity-80'
      )}
      title={task.status === 'scheduled' && task.nextRunAt ? `${task.blockedReason || 'Scheduled'} • ${new Date(task.nextRunAt).toLocaleString()}` : undefined}
    >
      <div className="flex items-start gap-2 mb-2">
        {priorityDot && (
          <div className={clsx("w-2 h-2 rounded-full mt-1.5 shrink-0", priorityDot)} />
        )}
        {!priorityDot && task.status === 'done' && (
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-done" />
        )}
        {task.isStale && (
          <span className="rounded-sm border border-status-blocked/20 bg-status-blocked/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-status-blocked">
            stale
          </span>
        )}
        <span className="text-[14px] font-medium text-text-primary leading-tight line-clamp-2">
          {task.title}
        </span>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-1.5">
          {task.status !== 'done' && task.status !== 'cancelled' && task.status !== 'scheduled' && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={(event) => { event.stopPropagation(); void scheduleForLater(); }}>
              <Clock3 className="h-3 w-3" /> Later
            </Button>
          )}
          {task.status === 'waiting-approval' && (
            <Badge variant="secondary" className="shrink-0 border-status-waiting/20 bg-status-waiting/10 text-status-waiting">
              APPROVAL
            </Badge>
          )}
          {task.status === 'scheduled' && (
            <Badge variant="secondary" className="shrink-0 border-border bg-surface-secondary text-text-secondary">
              <Clock3 className="mr-1 h-3 w-3" />
              {scheduleLabel ?? 'SCHEDULED'}
            </Badge>
          )}
          {task.status === 'scheduled' && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={(event) => { event.stopPropagation(); void unschedule(); }}>
              Cancel
            </Button>
          )}
          {task.status === 'review' && (
            <Badge variant="secondary" className="shrink-0 border-status-active/20 bg-brand-muted text-status-active">
              REVIEW
            </Badge>
          )}
          {task.status === 'blocked' && (
            <Badge variant="secondary" className="shrink-0 border-status-blocked/20 bg-status-blocked/10 text-status-blocked">
              BLOCKED
            </Badge>
          )}
          
          {agent && task.status !== 'waiting-approval' && task.status !== 'blocked' && (
            <div className="hidden items-center gap-1 text-xs text-text-secondary sm:flex">
              <Bot className={clsx('h-3.5 w-3.5', agent.state === 'active' ? 'text-brand' : 'text-text-tertiary')} />
              <span className="truncate max-w-[80px]">{agent.name}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {typeof task.costUsd === 'number' && task.costUsd > 0 && (
            <Badge variant="secondary" className="border-brand/15 bg-brand-muted text-brand">
              ${task.costUsd.toFixed(2)}
            </Badge>
          )}
          {task.createdAt && (
            <span className="text-[10px] text-text-tertiary">{new Date(task.createdAt).toLocaleDateString()}</span>
          )}
          {task.progress > 0 && task.status !== 'done' && (
            <div className="flex items-center gap-1.5 w-16 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                <div 
                  className="h-full bg-brand" 
                  style={{ width: `${task.progress}%` }} 
                />
              </div>
              <span className="text-[10px] font-medium text-text-tertiary">{task.progress}%</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
