import type { Task } from '../types'

export type TaskSurfaceState =
  | 'todo'
  | 'waiting'
  | 'queued'
  | 'dispatch-blocked'
  | 'dispatch-failed'
  | 'in-progress'
  | 'blocked'
  | 'scheduled'
  | 'review'
  | 'waiting-approval'
  | 'done'
  | 'cancelled'

export type TaskBoardLane = 'todo' | 'scheduled' | 'in-progress' | 'review' | 'done' | 'failed'

function hasAssignedAgent(task: Pick<Task, 'assigneeId'>): boolean {
  return Boolean(task.assigneeId && task.assigneeId !== 'unassigned')
}

export function isTaskRunning(task: Pick<Task, 'status' | 'executionStartedAt'>): boolean {
  return task.status === 'in-progress' && Boolean(task.executionStartedAt)
}

export function getTaskSurfaceState(task: Pick<Task, 'status' | 'assigneeId' | 'dispatchStatus' | 'executionStartedAt'>): TaskSurfaceState {
  if (task.status === 'scheduled') return 'scheduled'
  if (task.status === 'review') return 'review'
  if (task.status === 'waiting-approval') return 'waiting-approval'
  if (task.status === 'done') return 'done'
  if (task.status === 'cancelled') return 'cancelled'
  if (task.status === 'blocked') return 'blocked'
  if (isTaskRunning(task)) return 'in-progress'

  if (hasAssignedAgent(task) && (task.status === 'todo' || task.status === 'in-progress')) {
    switch (task.dispatchStatus) {
      case 'checking':
        return 'waiting'
      case 'ready':
      case 'started':
        return 'queued'
      case 'blocked':
        return 'dispatch-blocked'
      case 'failed':
        return 'dispatch-failed'
      default:
        if (task.status === 'in-progress') return 'waiting'
    }
  }

  return task.status === 'in-progress' ? 'waiting' : 'todo'
}

export function getTaskSurfaceLabel(task: Pick<Task, 'status' | 'assigneeId' | 'dispatchStatus' | 'executionStartedAt'>): string {
  switch (getTaskSurfaceState(task)) {
    case 'waiting':
      return 'waiting'
    case 'queued':
      return 'queued'
    case 'dispatch-blocked':
      return 'dispatch blocked'
    case 'dispatch-failed':
      return 'dispatch failed'
    case 'in-progress':
      return 'in progress'
    case 'waiting-approval':
      return 'awaiting approval'
    case 'scheduled':
      return 'scheduled'
    case 'review':
      return 'in review'
    case 'blocked':
      return 'blocked'
    case 'done':
      return 'done'
    case 'cancelled':
      return 'cancelled'
    case 'todo':
    default:
      return 'todo'
  }
}

export function getTaskBoardLane(task: Pick<Task, 'status' | 'assigneeId' | 'dispatchStatus' | 'executionStartedAt'>): TaskBoardLane | null {
  if (task.status === 'failed') return 'failed'
  if (task.status === 'scheduled') return 'scheduled'
  if (task.status === 'review' || task.status === 'waiting-approval') return 'review'
  if (task.status === 'done') return 'done'

  const surfaceState = getTaskSurfaceState(task)
  if (surfaceState === 'in-progress') return 'in-progress'
  if (surfaceState === 'todo' || surfaceState === 'waiting' || surfaceState === 'queued' || surfaceState === 'dispatch-blocked' || surfaceState === 'dispatch-failed' || surfaceState === 'blocked') {
    return 'todo'
  }

  return null
}

export function getTaskDispatchSummary(task: Pick<Task, 'status' | 'assigneeId' | 'dispatchStatus' | 'dispatchReason' | 'executionStartedAt'>): { label: string; message: string } | null {
  const fallbackReason = task.dispatchReason ?? 'RelayHQ has not started execution yet.'

  switch (getTaskSurfaceState(task)) {
    case 'waiting':
      return {
        label: 'Waiting',
        message: task.dispatchReason ?? 'Assigned to an agent and waiting for dispatcher evaluation.',
      }
    case 'queued':
      return {
        label: 'Queued',
        message: fallbackReason,
      }
    case 'dispatch-blocked':
      return {
        label: 'Dispatch blocked',
        message: fallbackReason,
      }
    case 'dispatch-failed':
      return {
        label: 'Dispatch failed',
        message: fallbackReason,
      }
    default:
      return null
  }
}
