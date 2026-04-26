import type { TaskStatus } from '../types';

export type BoardLaneId = 'todo' | 'in-progress' | 'review' | 'scheduled' | 'done';

export interface BoardDropResult {
  readonly status: TaskStatus;
  readonly column: string;
  readonly progress?: number;
}

export function resolveBoardDrop(targetLane: BoardLaneId, currentStatus: TaskStatus): BoardDropResult | null {
  if (targetLane === 'scheduled') {
    return null;
  }

  if (targetLane === 'done') {
    if (currentStatus !== 'review') {
      return null;
    }

    return { status: 'done', column: 'done', progress: 100 };
  }

  if (targetLane === 'review') {
    return { status: 'review', column: 'review' };
  }

  if (targetLane === 'in-progress') {
    return { status: 'in-progress', column: 'in-progress' };
  }

  return { status: 'todo', column: 'todo' };
}
