import type {
  ActiveAgentSession,
  AgentContextResponse,
  ProjectIndexStatusResponse,
  ReadModelDoc,
  ReadModelIssue,
  VaultDocEnvelope,
  VaultReadModel,
} from './contract'

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:44210'

export class RelayHQApiError extends Error {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'RelayHQApiError'
    this.statusCode = statusCode
  }
}

function resolveApiBaseUrl(): string {
  const value = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).trim()
  return value.replace(/\/+$/, '')
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!text.trim()) {
    return null as T
  }
  return JSON.parse(text) as T
}

function readErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string' && payload.trim().length > 0) return payload
  if (typeof payload !== 'object' || payload === null) return fallback
  const record = payload as { message?: string; statusMessage?: string; error?: string }
  return record.message || record.statusMessage || record.error || fallback
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const payload = await parseJson<unknown>(response)
  if (!response.ok) {
    throw new RelayHQApiError(readErrorMessage(payload, `RelayHQ request failed with status ${response.status}.`), response.status)
  }
  return payload as T
}

export interface VaultTaskCreatePayload {
  readonly title: string
  readonly projectId: string
  readonly boardId: string
  readonly columnId: string
  readonly priority: string
  readonly assignee: string
  readonly objective?: string
  readonly acceptanceCriteria?: ReadonlyArray<string>
  readonly constraints?: ReadonlyArray<string>
  readonly contextFiles?: ReadonlyArray<string>
  readonly tags?: ReadonlyArray<string>
  readonly dependsOn?: ReadonlyArray<string>
  readonly github_issue_id?: string
}

export interface RelayHQWorkspaceOption {
  readonly id: string
  readonly name: string
}

export interface RelayHQSettingsResponse {
  readonly vaultRoot: string | null
  readonly resolvedRoot: string
  readonly isValid: boolean
  readonly invalidReason: string | null
  readonly activeWorkspaceId: string | null
  readonly activeWorkspaceName: string | null
  readonly availableWorkspaces: ReadonlyArray<RelayHQWorkspaceOption>
}

export interface RelayHQVaultInitPayload {
  readonly vaultRoot: string
  readonly workspaceName: string
}

export interface RelayHQVaultInitResponse {
  readonly created: ReadonlyArray<string>
  readonly vaultRoot: string
  readonly workspaceId: string
}

export interface RelayHQSettingsSavePayload {
  readonly vaultRoot: string
  readonly workspaceId: string | null
}

export interface RelayHQProjectCreatePayload {
  readonly name: string
  readonly codebaseRoot?: string | null
}

export interface RelayHQProjectPatchPayload {
  readonly actorId?: string
  readonly patch: {
    readonly name?: string
    readonly codebase_root?: string | null
  }
}

export interface RelayHQProjectCreateResponse {
  readonly project: { id: string; name: string; codebaseRoot: string | null }
  readonly board: { id: string; name: string }
  readonly columns: ReadonlyArray<{ id: string; name: string }>
}

export interface RelayHQBrowseDirectoryEntry {
  readonly name: string
  readonly path: string
  readonly isVaultRoot: boolean
}

export interface RelayHQBrowseDirectoriesResponse {
  readonly currentPath: string
  readonly parentPath: string | null
  readonly entries: ReadonlyArray<RelayHQBrowseDirectoryEntry>
}

export interface RelayHQToolSnippet {
  readonly snippet: string
  readonly configFilePath: string
  readonly instruction: string
}

export interface RelayHQScannedAgentTool {
  readonly id: string
  readonly name: string
  readonly detected: boolean
  readonly alreadyRegistered: boolean
  readonly configPath: string
  readonly snippet: RelayHQToolSnippet
}

export interface VaultTaskPatchPayload {
  readonly actorId: string
  readonly patch: Record<string, unknown>
}

export interface VaultIssueCreatePayload {
  readonly projectId: string
  readonly title: string
  readonly problem?: string
  readonly priority: string
  readonly reportedBy: string
}

export interface VaultIssuePatchPayload {
  readonly actorId: string
  readonly patch: Record<string, unknown>
}

export interface VaultDocCreatePayload {
  readonly title: string
  readonly doc_type: string
  readonly project_id?: string | null
  readonly status?: string
  readonly tags?: ReadonlyArray<string>
  readonly body?: string
}

export interface VaultDocPatchPayload {
  readonly patch: {
    readonly title?: string
    readonly doc_type?: string
    readonly status?: string
    readonly project_id?: string | null
    readonly tags?: ReadonlyArray<string>
    readonly body?: string
  }
}

export interface TaskTemplateCreatePayload {
  readonly name: string
  readonly title: string
  readonly objective: string
  readonly acceptanceCriteria: string
  readonly contextFiles: string
  readonly constraints: string
}

export interface RegisterAgentsPayload {
  readonly toolIds: ReadonlyArray<string>
}

export interface AgentPatchPayload {
  readonly patch: {
    readonly name?: string
    readonly capabilities?: ReadonlyArray<string>
    readonly approval_required_for?: ReadonlyArray<string>
  }
}

export const relayhqApi = {
  getReadModel: () => request<VaultReadModel>('/api/vault/read-model'),
  getActiveAgents: () => request<ReadonlyArray<ActiveAgentSession>>('/api/agent/active'),
  getAgentContext: () => request<AgentContextResponse>('/api/agent/context'),
  getSettings: () => request<RelayHQSettingsResponse>('/api/settings'),
  initVault: (payload: RelayHQVaultInitPayload) => request<RelayHQVaultInitResponse>('/api/vault/init', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  saveSettings: (payload: RelayHQSettingsSavePayload) => request<{ success: true; vaultRoot: string; workspaceId: string | null }>('/api/settings', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  createProject: (payload: RelayHQProjectCreatePayload) => request<RelayHQProjectCreateResponse>('/api/vault/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  patchProject: (projectId: string, payload: RelayHQProjectPatchPayload) => request<{ id: string; name: string; codebases: ReadonlyArray<{ name: string; path: string }>; description: string | null; status: string | null }>(`/api/vault/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  deleteProject: (projectId: string) => request<{ success: boolean; deletedPaths: ReadonlyArray<string> }>(`/api/vault/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  }),
  browseDirectories: (path?: string) => request<RelayHQBrowseDirectoriesResponse>(`/api/settings/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  scanAgents: () => request<{ discovered: ReadonlyArray<RelayHQScannedAgentTool> }>('/api/settings/scan-agents'),
  registerAgents: (payload: RegisterAgentsPayload) => request<{ created: ReadonlyArray<{ id: string; sourcePath: string }>; skipped: ReadonlyArray<{ id: string; reason: 'not-detected' | 'already-registered' }> }>('/api/settings/register-agents', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  patchAgent: (agentId: string, payload: AgentPatchPayload) => request<{ success: boolean; agentId: string }>(`/api/vault/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),

  createTask: (payload: VaultTaskCreatePayload) => request<{ taskId: string; boardId: string; sourcePath: string }>('/api/vault/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  patchTask: (taskId: string, payload: VaultTaskPatchPayload) => request<unknown>(`/api/vault/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  approveTask: (taskId: string, actorId: string) => request<unknown>(`/api/vault/tasks/${encodeURIComponent(taskId)}/approve`, {
    method: 'POST',
    body: JSON.stringify({ actorId }),
  }),
  rejectTask: (taskId: string, actorId: string, reason: string) => request<unknown>(`/api/vault/tasks/${encodeURIComponent(taskId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({ actorId, reason }),
  }),

  listIssues: (projectId: string, status?: string) => request<{ issues: ReadonlyArray<Pick<ReadModelIssue, 'id' | 'title' | 'status' | 'priority' | 'projectId' | 'createdAt' | 'updatedAt' | 'tags' | 'linkedTaskIds'> & { reportedBy: string }> }>(`/api/vault/issues?projectId=${encodeURIComponent(projectId)}${status ? `&status=${encodeURIComponent(status)}` : ''}`),
  getIssue: (issueId: string) => request<{ id: string; title: string; status: string; priority: string; reportedBy: string; createdAt: string; updatedAt: string; projectId: string; problem: string | null; context: string | null; comments: ReadonlyArray<{ author: string; timestamp: string; body: string }>; linkedTaskIds: ReadonlyArray<string>; tags: ReadonlyArray<string> }>(`/api/vault/issues/${encodeURIComponent(issueId)}`),
  createIssue: (payload: VaultIssueCreatePayload) => request<unknown>('/api/vault/issues', { method: 'POST', body: JSON.stringify(payload) }),
  patchIssue: (issueId: string, payload: VaultIssuePatchPayload) => request<unknown>(`/api/vault/issues/${encodeURIComponent(issueId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  commentIssue: (issueId: string, actorId: string, body: string) => request<unknown>(`/api/vault/issues/${encodeURIComponent(issueId)}/comments`, { method: 'POST', body: JSON.stringify({ actorId, body }) }),

  listDocs: (projectId?: string) => request<VaultDocEnvelope<ReadonlyArray<{ id: string; title: string; doc_type: string; status: string; workspace_id: string; project_id: string | null; updated_at: string; created_at: string; tags: ReadonlyArray<string>; sourcePath: string }>>>(`/api/vault/docs${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`),
  getDoc: (docId: string) => request<VaultDocEnvelope<{ id: string; title: string; doc_type: string; status: string; workspace_id: string; project_id: string | null; created_at: string; updated_at: string; tags: ReadonlyArray<string>; body: string; sourcePath: string }>>(`/api/vault/docs/${encodeURIComponent(docId)}`),
  createDoc: (payload: VaultDocCreatePayload) => request<VaultDocEnvelope<{ id: string; title: string; doc_type: string; status: string; project_id: string | null; sourcePath: string }>>('/api/vault/docs', { method: 'POST', body: JSON.stringify(payload) }),
  patchDoc: (docId: string, payload: VaultDocPatchPayload) => request<VaultDocEnvelope<{ id: string; title: string; doc_type: string; status: string; project_id: string | null; updated_at: string; body: string }>>(`/api/vault/docs/${encodeURIComponent(docId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  createTaskTemplate: (payload: TaskTemplateCreatePayload) => request<{ success: boolean; data: { name: string; path: string }; error: string | null }>('/api/vault/task-templates', { method: 'POST', body: JSON.stringify(payload) }),

  writeShellProfile: (target: 'zshrc' | 'bashrc') => request<{ written: boolean; path: string }>('/api/settings/shell-profile', {
    method: 'POST',
    body: JSON.stringify({ target }),
  }),

  getProjectIndexStatus: (projectId: string) => request<ProjectIndexStatusResponse>(`/api/vault/projects/${encodeURIComponent(projectId)}/index-status`),
  indexProject: (projectId: string, codebaseName?: string) => request<{ indexedFiles: number; resolvedPaths: ReadonlyArray<string>; warnings: ReadonlyArray<string>; status: ProjectIndexStatusResponse }>(`/api/vault/projects/${encodeURIComponent(projectId)}/index`, {
    method: 'POST',
    body: JSON.stringify(codebaseName ? { codebaseName } : {}),
  }),

  searchCode: (query: string, projectId?: string) => request<{ query: string; hits: ReadonlyArray<{ id: string; title: string; summary: string; sourcePath: string; score: number; codebaseName?: string | null }>; hint?: string }>(`/api/agent/search-code?q=${encodeURIComponent(query)}${projectId ? `&projectId=${encodeURIComponent(projectId)}` : ''}`),
}

export type RelayHQApiClient = typeof relayhqApi
