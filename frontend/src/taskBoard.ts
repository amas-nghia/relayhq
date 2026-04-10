export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'review' | 'done' | 'cancelled'

export type Task = {
  id?: string | number
  project_id: string
  title: string
  details?: string
  status: TaskStatus
}

export type TaskDraft = {
  project_id: string
  title: string
  details: string
  status: TaskStatus
}

export const tasksEndpoint = '/api/v1/tasks'

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

  if (payload && typeof payload === 'object' && Array.isArray((payload as { tasks?: unknown }).tasks)) {
    return (payload as { tasks: Task[] }).tasks
  }

  return []
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
