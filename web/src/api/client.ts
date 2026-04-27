import type {
  AgentStateResponse,
  ActiveAgentSession,
  AgentContextResponse,
  ProjectIndexStatusResponse,
  ReadModelDoc,
  VaultDocEnvelope,
  VaultReadModel,
} from './contract'

export type { AgentStateResponse } from './contract'

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:44210'

export class RelayHQApiError extends Error {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'RelayHQApiError'
    this.statusCode = statusCode
  }
}

export function getRelayHQApiBaseUrl(): string {
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
  const response = await fetch(`${getRelayHQApiBaseUrl()}${path}`, {
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
  readonly assignee?: string
  readonly requiredCapability?: string
  readonly objective?: string
  readonly acceptanceCriteria?: ReadonlyArray<string>
  readonly constraints?: ReadonlyArray<string>
  readonly contextFiles?: ReadonlyArray<string>
  readonly tags?: ReadonlyArray<string>
  readonly dependsOn?: ReadonlyArray<string>
  readonly cron_schedule?: string
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
  readonly platform?: string
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
    readonly budget?: string | null
    readonly deadline?: string | null
    readonly status?: string | null
    readonly links?: ReadonlyArray<{ label: string; url: string }>
    readonly attachments?: ReadonlyArray<{ label: string; url: string; type: string; addedAt: string }>
    readonly codebase_root?: string | null
  }
}

export interface RelayHQProjectCreateResponse {
  readonly project: { id: string; name: string; codebaseRoot: string | null }
  readonly board: { id: string; name: string }
  readonly columns: ReadonlyArray<{ id: string; name: string }>
}

export interface RelayHQApiKeyEntry {
  readonly envVar: string
  readonly provider: string
  readonly label: string
  readonly isSet: boolean
  readonly preview: string | null
}

export interface RelayHQApiKeysResponse {
  readonly keys: ReadonlyArray<RelayHQApiKeyEntry>
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

export interface RelayHQVaultFileEntry {
  readonly path: string
  readonly label: string
  readonly kind: string
}

export interface RelayHQToolSnippet {
  readonly snippet: string
  readonly configFilePath: string
  readonly instruction: string
}

export type RelayHQWebhookEvent = 'task.created' | 'task.claimed' | 'task.review' | 'task.done' | 'task.blocked' | 'task.waiting-approval' | 'task.scheduled' | 'task.updated' | 'task.approved' | 'task.rejected'

export interface RelayHQWebhookDeliveryRecord {
  readonly id: string
  readonly webhookId: string
  readonly event: RelayHQWebhookEvent
  readonly status: 'success' | 'failed'
  readonly responseStatus: number | null
  readonly error: string | null
  readonly attemptCount: number
  readonly deliveredAt: string
}

export interface RelayHQWebhookConfig {
  readonly id: string
  readonly url: string
  readonly events: ReadonlyArray<RelayHQWebhookEvent>
  readonly signingSecretRef: string | null
}

export interface RelayHQWebhookSettingsResponse {
  readonly webhooks: ReadonlyArray<RelayHQWebhookConfig>
  readonly deliveries: ReadonlyArray<RelayHQWebhookDeliveryRecord>
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
  readonly autoRun?: boolean
}

export interface AgentRunPayload {
  readonly taskId: string
}

export interface VaultTaskSchedulePayload {
  readonly actorId: string
  readonly nextRunAt: string
  readonly reason?: string
}

export interface VaultIssuePromotePayload {
  readonly boardId: string
  readonly columnId: string
  readonly assignee: string
  readonly objective: string
  readonly acceptanceCriteria: ReadonlyArray<string>
}

export interface VaultDocCreatePayload {
  readonly title: string
  readonly doc_type: string
  readonly project_id?: string | null
  readonly status?: string
  readonly visibility?: string
  readonly access_roles?: ReadonlyArray<string>
  readonly sensitive?: boolean
  readonly tags?: ReadonlyArray<string>
  readonly body?: string
}

export interface VaultDocPatchPayload {
  readonly patch: {
    readonly title?: string
    readonly doc_type?: string
    readonly status?: string
    readonly project_id?: string | null
    readonly visibility?: string
    readonly access_roles?: ReadonlyArray<string>
    readonly sensitive?: boolean
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

export interface TaskTemplateRecord {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly objective: string
  readonly acceptanceCriteria: ReadonlyArray<string>
  readonly contextFiles: ReadonlyArray<string>
  readonly constraints: ReadonlyArray<string>
  readonly sourcePath: string
}

export interface TaskThreadRecord {
  readonly id: string
  readonly taskId: string
  readonly projectId: string
  readonly workspaceId: string
  readonly createdAt: string | null
  readonly updatedAt: string | null
  readonly comments: ReadonlyArray<{ author: string; timestamp: string; body: string }>
  readonly sourcePath: string
}

export interface RegisterAgentsPayload {
  readonly toolIds: ReadonlyArray<string>
}

export interface AgentCreatePayload {
  readonly name: string
  readonly role: string
  readonly provider: string
  readonly model: string
  readonly accountId?: string | null
  readonly apiKeyRef?: string | null
  readonly portraitAsset?: string | null
  readonly spriteAsset?: string | null
  readonly monthlyBudgetUsd?: number | null
  readonly aliases?: ReadonlyArray<string>
  readonly runCommand?: string | null
  readonly runMode?: string | null
  readonly webhookUrl?: string | null
  readonly capabilities?: ReadonlyArray<string>
  readonly approvalRequiredFor?: ReadonlyArray<string>
}

export interface AgentPatchPayload {
  readonly patch: {
    readonly name?: string
    readonly account_id?: string
    readonly api_key_ref?: string
    readonly portrait_asset?: string
    readonly sprite_asset?: string
    readonly monthly_budget_usd?: number
    readonly run_command?: string
    readonly run_mode?: string
    readonly webhook_url?: string
    readonly aliases?: ReadonlyArray<string>
    readonly capabilities?: ReadonlyArray<string>
    readonly approval_required_for?: ReadonlyArray<string>
  }
}

export interface AgentActivityEvent {
  readonly timestamp: string
  readonly event_type: string
  readonly taskId: string | null
  readonly tokens_used: number | null
  readonly model: string | null
}

export interface AnalyticsCostDay {
  readonly day: string
  readonly costUsd: number
  readonly tokensUsed: number
  readonly taskCount: number
}

export interface AnalyticsCostProject {
  readonly projectId: string
  readonly projectName: string
  readonly costUsd: number
  readonly tokensUsed: number
  readonly taskCount: number
}

export interface AnalyticsCostResponse {
  readonly totals: {
    readonly costUsd: number
    readonly tokensUsed: number
    readonly taskCount: number
  }
  readonly byDay: ReadonlyArray<AnalyticsCostDay>
  readonly byProject: ReadonlyArray<AnalyticsCostProject>
}

export interface AnalyticsVelocityWeek {
  readonly weekStart: string
  readonly completedCount: number
}

export interface AnalyticsVelocityResponse {
  readonly totals: {
    readonly completedCount: number
    readonly p50DaysToComplete: number | null
    readonly p95DaysToComplete: number | null
  }
  readonly completedPerWeek: ReadonlyArray<AnalyticsVelocityWeek>
}

export interface AnalyticsAgentScorecard {
  readonly agentId: string
  readonly agentName: string
  readonly provider: string | null
  readonly model: string | null
  readonly taskCount: number
  readonly completedTaskCount: number
  readonly activeTaskCount: number
  readonly waitingApprovalCount: number
  readonly stuckCount: number
  readonly approvalRate: number | null
  readonly avgCompletionDays: number | null
  readonly lastCompletedAt: string | null
  readonly costUsd: number
  readonly tokensUsed: number
  readonly monthlyBudgetUsd: number | null
  readonly monthlyCostUsd: number
  readonly remainingBudgetUsd: number | null
}

export interface AnalyticsAgentsResponse {
  readonly totals: {
    readonly agentCount: number
    readonly activeTaskCount: number
    readonly stuckTaskCount: number
  }
  readonly scorecards: ReadonlyArray<AnalyticsAgentScorecard>
}

export interface AnalyticsDashboardResponse {
  readonly cost: AnalyticsCostResponse
  readonly velocity: AnalyticsVelocityResponse
  readonly agents: AnalyticsAgentsResponse
}

export const relayhqApi = {
  getReadModel: () => request<VaultReadModel>('/api/vault/read-model'),
  getAgentState: (agentId: string) => request<AgentStateResponse>(`/api/agent/state?agentId=${encodeURIComponent(agentId)}`),
  getActiveAgents: () => request<ReadonlyArray<ActiveAgentSession>>('/api/agent/active'),
  getAgentContext: () => request<AgentContextResponse>('/api/agent/context'),
  getAgentActivity: (agentId: string) => request<ReadonlyArray<AgentActivityEvent>>(`/api/agent/${encodeURIComponent(agentId)}/activity`),
  getCostSummary: () => request<{ total_tokens: number; total_cost_usd: number; model_breakdown: ReadonlyArray<{ model: string; task_count: number; tokens_used: number; cost_usd: number }>; agent_breakdown: ReadonlyArray<{ agent_id: string; tokens_used: number; cost_usd: number }>; context_reuse_savings: number }>('/api/agent/cost-summary'),
  getAnalyticsSummary: () => request<AnalyticsDashboardResponse>('/api/analytics/summary'),
  getAnalyticsCost: () => request<AnalyticsCostResponse>('/api/analytics/cost'),
  getAnalyticsVelocity: () => request<AnalyticsVelocityResponse>('/api/analytics/velocity'),
  getAnalyticsAgents: () => request<AnalyticsAgentsResponse>('/api/analytics/agents'),
  getSettings: () => request<RelayHQSettingsResponse>('/api/settings'),
  getAgentInstall: (runtime: string) => request<{ runtime: string; filename: string; content: string }>(`/api/agent/install?runtime=${encodeURIComponent(runtime)}`),
  getMcpSnippet: (tool: string) => request<{ snippet: string; configFilePath: string; instruction: string }>(`/api/settings/snippets?tool=${encodeURIComponent(tool)}`),
  initVault: (payload: RelayHQVaultInitPayload) => request<RelayHQVaultInitResponse>('/api/vault/init', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  saveSettings: (payload: RelayHQSettingsSavePayload) => request<{ success: true; vaultRoot: string; workspaceId: string | null }>('/api/settings', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  createAgent: (payload: AgentCreatePayload) => request<{ agent: { id: string; type: string; name: string }; sourcePath: string }>('/api/vault/agents', {
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
  getApiKeys: () => request<RelayHQApiKeysResponse>('/api/settings/api-keys'),
  listVaultFiles: () => request<ReadonlyArray<RelayHQVaultFileEntry>>('/api/settings/vault-files'),
  scanAgents: () => request<{ discovered: ReadonlyArray<RelayHQScannedAgentTool> }>('/api/settings/scan-agents'),
  getWebhookSettings: () => request<RelayHQWebhookSettingsResponse>('/api/settings/webhooks'),
  saveWebhookSettings: (payload: { webhooks: ReadonlyArray<{ id?: string; url: string; events: ReadonlyArray<RelayHQWebhookEvent>; signingSecretRef?: string | null }> }) => request<RelayHQWebhookSettingsResponse>('/api/settings/webhooks', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  testWebhook: (payload: { url: string; event?: RelayHQWebhookEvent; signingSecretRef?: string | null }) => request<{ success: boolean; delivery: RelayHQWebhookDeliveryRecord }>('/api/settings/webhooks/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  registerAgents: (payload: RegisterAgentsPayload) => request<{ created: ReadonlyArray<{ id: string; sourcePath: string }>; skipped: ReadonlyArray<{ id: string; reason: 'not-detected' | 'already-registered' }> }>('/api/settings/register-agents', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  patchAgent: (agentId: string, payload: AgentPatchPayload) => request<{ success: boolean; agentId: string }>(`/api/vault/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }),
  deleteAgent: (agentId: string) => request<{ success: boolean; agentId: string }>(`/api/vault/agents/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  }),
  runAgent: (agentId: string, payload: AgentRunPayload) => request<{ agentId: string; taskId: string; runnerId: string; command: string }>(`/api/agent/${encodeURIComponent(agentId)}/run`, {
    method: 'POST',
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
  scheduleTask: (taskId: string, payload: VaultTaskSchedulePayload) => request<unknown>(`/api/vault/tasks/${encodeURIComponent(taskId)}/schedule`, {
    method: 'POST',
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

  promoteIssue: (issueId: string, payload: VaultIssuePromotePayload) => request<{ task: { id: string; title: string; status: string; priority: string; assignee: string; boardId: string; columnId: string } }>(`/api/vault/tasks/${encodeURIComponent(issueId)}/promote`, { method: 'POST', body: JSON.stringify(payload) }),

  listDocs: (projectId?: string) => request<VaultDocEnvelope<ReadonlyArray<{ id: string; title: string; doc_type: string; status: string; visibility: string; access_roles: ReadonlyArray<string>; sensitive: boolean; workspace_id: string; project_id: string | null; updated_at: string; created_at: string; tags: ReadonlyArray<string>; sourcePath: string }>>>(`/api/vault/docs${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`),
  getDoc: (docId: string) => request<VaultDocEnvelope<{ id: string; title: string; doc_type: string; status: string; visibility: string; access_roles: ReadonlyArray<string>; sensitive: boolean; workspace_id: string; project_id: string | null; created_at: string; updated_at: string; tags: ReadonlyArray<string>; body: string; sourcePath: string }>>(`/api/vault/docs/${encodeURIComponent(docId)}`),
  createDoc: (payload: VaultDocCreatePayload) => request<VaultDocEnvelope<{ id: string; title: string; doc_type: string; status: string; visibility: string; access_roles: ReadonlyArray<string>; sensitive: boolean; project_id: string | null; sourcePath: string }>>('/api/vault/docs', { method: 'POST', body: JSON.stringify(payload) }),
  patchDoc: (docId: string, payload: VaultDocPatchPayload) => request<VaultDocEnvelope<{ id: string; title: string; doc_type: string; status: string; visibility: string; access_roles: ReadonlyArray<string>; sensitive: boolean; project_id: string | null; updated_at: string; body: string }>>(`/api/vault/docs/${encodeURIComponent(docId)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  listTaskTemplates: () => request<{ data: ReadonlyArray<TaskTemplateRecord>; error: string | null }>('/api/vault/task-templates'),
  createTaskTemplate: (payload: TaskTemplateCreatePayload) => request<{ success: boolean; data: { id: string; name: string; path: string }; error: string | null }>('/api/vault/task-templates', { method: 'POST', body: JSON.stringify(payload) }),
  deleteTaskTemplate: (templateId: string) => request<{ success: boolean; data: { id: string; path: string }; error: string | null }>(`/api/vault/task-templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' }),
  getTaskComments: (taskId: string) => request<{ data: TaskThreadRecord; error: string | null }>(`/api/vault/tasks/${encodeURIComponent(taskId)}/comments`),
  addTaskComment: (taskId: string, payload: { author: string; body: string }) => request<{ data: TaskThreadRecord; error: string | null }>(`/api/vault/tasks/${encodeURIComponent(taskId)}/comments`, { method: 'POST', body: JSON.stringify(payload) }),

  startOAuth: (provider: 'openrouter' | 'openai') => request<{ authUrl: string; state: string }>(`/api/auth/${provider}/start`),
  pollOAuth: (provider: 'openrouter' | 'openai', state: string) => request<{ status: 'pending' | 'complete' | 'error' | 'expired'; apiKey?: string; error?: string }>(`/api/auth/${provider}/result?state=${encodeURIComponent(state)}`),

  verifyApiKey: (provider: string, apiKey: string) => request<{ valid: boolean; error?: string; models?: string[] }>('/api/settings/verify-key', {
    method: 'POST',
    body: JSON.stringify({ provider, apiKey }),
  }),

  writeShellProfile: (target: 'zshrc' | 'bashrc' | 'powershell') => request<{ written: boolean; path: string }>('/api/settings/shell-profile', {
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
