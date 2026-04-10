export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled'

export type Task = {
  id?: string | number
  project_id: string
  title: string
  details?: string
  status: TaskStatus
  created_at?: string
  updated_at?: string
}

export type TaskDraft = {
  project_id: string
  title: string
  details: string
  status: TaskStatus
}

export type BoardColumnKey = 'todo' | 'doing' | 'review' | 'done'

export type BoardColumn = {
  key: BoardColumnKey
  label: string
  statuses: TaskStatus[]
}

export type BoardApiColumn = {
  key?: BoardColumnKey | string
  title?: string
  count?: number
  tasks?: Task[]
}

export type Board = {
  project_id: string
  columns: BoardApiColumn[]
}

export const boardColumns: BoardColumn[] = [
  { key: 'todo', label: 'Todo', statuses: ['todo'] },
  { key: 'doing', label: 'Doing', statuses: ['in_progress', 'blocked'] },
  { key: 'review', label: 'Review', statuses: ['review'] },
  { key: 'done', label: 'Done', statuses: ['done', 'cancelled'] },
]

export const tasksEndpoint = '/api/v1/tasks'
export const boardsEndpoint = '/api/v1/boards'

export const taskStatuses: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled']

export const emptyTaskDraft: TaskDraft = {
  project_id: '',
  title: '',
  details: '',
  status: 'todo',
}

export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()

  if (!text) {
    return null
  }

  return JSON.parse(text) as unknown
}

export function extractTasks(payload: unknown): Task[] {
  if (Array.isArray(payload)) {
    return payload as Task[]
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  const candidate = payload as {
    tasks?: unknown
    items?: unknown
    board?: { columns?: unknown }
    columns?: unknown
  }

  if (Array.isArray(candidate.tasks)) {
    return candidate.tasks as Task[]
  }

  if (Array.isArray(candidate.items)) {
    return candidate.items as Task[]
  }

  if (candidate.board && Array.isArray(candidate.board.columns)) {
    return flattenColumnPayload(candidate.board.columns)
  }

  if (candidate.board && typeof candidate.board === 'object') {
    const board = candidate.board as { columns?: unknown }

    if (board.columns && !Array.isArray(board.columns) && typeof board.columns === 'object') {
      return flattenColumnMapPayload(board.columns as Record<string, unknown>)
    }
  }

  if (Array.isArray(candidate.columns)) {
    return flattenColumnPayload(candidate.columns)
  }

  if (candidate.columns && typeof candidate.columns === 'object') {
    return flattenColumnMapPayload(candidate.columns as Record<string, unknown>)
  }

  return []
}

export function extractBoard(payload: unknown): Board {
  if (payload && typeof payload === 'object' && Array.isArray((payload as { columns?: unknown }).columns)) {
    const candidate = payload as Board
    return {
      project_id: candidate.project_id || '',
      columns: candidate.columns ?? [],
    }
  }

  return { project_id: '', columns: [] }
}

function flattenColumnPayload(columns: unknown[]): Task[] {
  const tasks: Task[] = []

  for (const column of columns) {
    if (!column || typeof column !== 'object') {
      continue
    }

    const candidate = column as { tasks?: unknown; items?: unknown; cards?: unknown }

    if (Array.isArray(candidate.tasks)) {
      tasks.push(...(candidate.tasks as Task[]))
      continue
    }

    if (Array.isArray(candidate.items)) {
      tasks.push(...(candidate.items as Task[]))
      continue
    }

    if (Array.isArray(candidate.cards)) {
      tasks.push(...(candidate.cards as Task[]))
    }
  }

  return tasks
}

function flattenColumnMapPayload(columns: Record<string, unknown>): Task[] {
  const tasks: Task[] = []

  for (const value of Object.values(columns)) {
    if (Array.isArray(value)) {
      tasks.push(...(value as Task[]))
      continue
    }

    if (value && typeof value === 'object') {
      const nested = value as { tasks?: unknown; items?: unknown; cards?: unknown }

      if (Array.isArray(nested.tasks)) {
        tasks.push(...(nested.tasks as Task[]))
      } else if (Array.isArray(nested.items)) {
        tasks.push(...(nested.items as Task[]))
      } else if (Array.isArray(nested.cards)) {
        tasks.push(...(nested.cards as Task[]))
      }
    }
  }

  return tasks
}

export function getBoardColumnKey(status: TaskStatus): BoardColumnKey {
  switch (status) {
    case 'todo':
      return 'todo'
    case 'in_progress':
    case 'blocked':
      return 'doing'
    case 'review':
      return 'review'
    case 'done':
    case 'cancelled':
      return 'done'
  }
}

export function groupTasksByBoardColumn(tasks: Task[]): Record<BoardColumnKey, Task[]> {
  const grouped: Record<BoardColumnKey, Task[]> = {
    todo: [],
    doing: [],
    review: [],
    done: [],
  }

  for (const task of tasks) {
    grouped[getBoardColumnKey(task.status)].push(task)
  }

  return grouped
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Something went wrong.'
}

export async function fetchTasks(projectId: string) {
  const response = await fetch(`${tasksEndpoint}?project_id=${encodeURIComponent(projectId)}`)

  if (!response.ok) {
    throw new Error(`GET ${tasksEndpoint} failed (${response.status})`)
  }

  return extractTasks(await readJson(response))
}

export async function fetchBoard(projectId: string) {
  const response = await fetch(`${boardsEndpoint}?project_id=${encodeURIComponent(projectId)}`)

  if (!response.ok) {
    throw new Error(`GET ${boardsEndpoint} failed (${response.status})`)
  }

  return extractBoard(await readJson(response))
}

export async function createTask(draft: TaskDraft) {
  const response = await fetch(tasksEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(draft),
  })

  if (!response.ok) {
    throw new Error(`POST ${tasksEndpoint} failed (${response.status})`)
  }

  return readJson(response)
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const response = await fetch(`${tasksEndpoint}/${encodeURIComponent(taskId)}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  })

  if (!response.ok) {
    throw new Error(`PATCH ${tasksEndpoint}/${taskId}/status failed (${response.status})`)
  }

  return readJson(response)
}
