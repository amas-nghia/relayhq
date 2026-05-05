import type { BoardLaneId } from './boardDrop';

export const DEFAULT_BOARD_LANE: BoardLaneId = 'in-progress';

const BOARD_LANES = new Set<BoardLaneId>(['todo', 'scheduled', 'in-progress', 'review', 'done']);

export function isBoardLaneId(value: string | null): value is BoardLaneId {
  return value !== null && BOARD_LANES.has(value as BoardLaneId);
}

export function getBoardLaneFromSearchParams(searchParams: URLSearchParams): BoardLaneId {
  const lane = searchParams.get('lane');
  return isBoardLaneId(lane) ? lane : DEFAULT_BOARD_LANE;
}

export function withBoardLane(searchParams: URLSearchParams, lane: BoardLaneId): URLSearchParams {
  const next = new URLSearchParams(searchParams);

  if (lane === DEFAULT_BOARD_LANE) {
    next.delete('lane');
    return next;
  }

  next.set('lane', lane);
  return next;
}
