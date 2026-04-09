export type Project = {
  id?: string | number
  name: string
  summary?: string
  owner: string
}

export type ProjectDraft = {
  name: string
  summary: string
  owner: string
}

export const projectsEndpoint = '/api/v1/projects'

export const emptyDraft: ProjectDraft = {
  name: '',
  summary: '',
  owner: '',
}

export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()

  if (!text) {
    return null
  }

  return JSON.parse(text) as unknown
}

export function extractProjects(payload: unknown): Project[] {
  if (Array.isArray(payload)) {
    return payload as Project[]
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { projects?: unknown }).projects)) {
    return (payload as { projects: Project[] }).projects
  }

  return []
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Something went wrong.'
}

export async function fetchProjects() {
  const response = await fetch(projectsEndpoint)

  if (!response.ok) {
    throw new Error(`GET ${projectsEndpoint} failed (${response.status})`)
  }

  return extractProjects(await readJson(response))
}
