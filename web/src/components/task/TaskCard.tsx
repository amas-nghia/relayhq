import { Bot, Check } from 'lucide-react';
import { Task } from '../../types';
import { useAppStore } from '../../store/appStore';
import clsx from 'clsx';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';

export function TaskCard({ task }: { task: Task; key?: string | number }) {
  const openDetail = useAppStore(state => state.openTaskDetail);
  const selectedTaskId = useAppStore(state => state.selectedTaskId);
  const agent = useAppStore(state => state.agents.find(a => a.id === task.assigneeId));
  const isSelected = selectedTaskId === task.id;

  let leftBorderClass = 'border-l-4 border-l-transparent';
  if (task.status === 'blocked') leftBorderClass = 'border-l-4 border-l-status-blocked';
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
        task.status === 'done' && 'opacity-60 hover:translate-y-0 hover:opacity-100'
      )}
    >
      <div className="flex items-start gap-2 mb-2">
        {priorityDot && (
          <div className={clsx("w-2 h-2 rounded-full mt-1.5 shrink-0", priorityDot)} />
        )}
        {!priorityDot && task.status === 'done' && (
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-done" />
        )}
        <span className="text-[14px] font-medium text-text-primary leading-tight line-clamp-2">
          {task.title}
        </span>
      </div>

      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-1.5">
          {task.status === 'waiting-approval' && (
            <Badge variant="secondary" className="shrink-0 border-status-waiting/20 bg-status-waiting/10 text-status-waiting">
              WAITING
            </Badge>
          )}
          {task.status === 'blocked' && (
            <Badge variant="secondary" className="shrink-0 border-status-blocked/20 bg-status-blocked/10 text-status-blocked">
              BLOCKED
            </Badge>
          )}
          
          {agent && task.status !== 'waiting-approval' && task.status !== 'blocked' && (
            <div className="flex items-center gap-1 text-xs text-text-secondary">
              <Bot className={clsx('h-3.5 w-3.5', agent.state === 'active' ? 'text-brand' : 'text-text-tertiary')} />
              <span className="truncate max-w-[80px]">{agent.name}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
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
