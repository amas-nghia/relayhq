import { create } from 'zustand'

import { getRelayHQApiBaseUrl, relayhqApi } from '../api/client'
import type { RelayHQSettingsResponse } from '../api/client'
import type { ActiveAgentSession, ReadModelColumn, ReadModelAuditNote, VaultReadModel } from '../api/contract'
import type { Agent, AuditLog, Project, Task, Theme } from '../types'

const THEME_STORAGE_KEY = 'relayhq-theme'
const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)'

let themeMediaQuery: MediaQueryList | null = null
let themeMediaListener: ((event: MediaQueryListEvent) => void) | null = null
let realtimeSource: EventSource | null = null
let realtimeRefreshTimeoutId: number | null = null
let realtimeRefreshQueued = false
let realtimeRefreshInFlight = false
let snapshotLoadInFlight: Promise<void> | null = null

interface AppState {
  tasks: Task[]
  agents: Agent[]
  projects: Project[]
  columns: ReadonlyArray<ReadModelColumn>
  auditNotes: ReadonlyArray<ReadModelAuditNote>
  settings: RelayHQSettingsResponse | null
  showOnboarding: boolean
  auditLogs: AuditLog[]
  lastFetched: Date | null
  selectedTaskId: string | null
  isDetailPanelOpen: boolean
  isNewTaskModalOpen: boolean
  selectedProjectId: string | null
  isLoading: boolean
  error: string | null
  isMutating: boolean
  mutationError: string | null
  refreshIntervalId: number | null
  themePreference: Theme

  setSelectedProjectId: (id: string | null) => void
  setTheme: (theme: Theme) => void
  openTaskDetail: (taskId: string) => void
  closeTaskDetail: () => void
  openNewTaskModal: () => void
  closeNewTaskModal: () => void
  loadData: () => Promise<void>
  fetchReadModel: () => Promise<void>
  startRealtime: () => void
  stopRealtime: () => void
  startPolling: () => void
  stopPolling: () => void
  addTask: (payload: {
    title: string
    description?: string
    projectId: string
    boardId?: string
    assigneeId?: string
    requiredCapability?: string
    priority: Task['priority']
    objective?: string
    acceptanceCriteria?: string[]
    constraints?: string[]
    contextFiles?: string[]
    cronSchedule?: string
  }) => Promise<void>
  approveTask: (taskId: string) => Promise<void>
  rejectTask: (taskId: string, reason: string) => Promise<void>
  startAutoRun: (taskId: string) => Promise<void>
  moveTaskToStatus: (taskId: string, status: Task['status'], actorId?: string) => Promise<void>
}

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isTheme(stored) ? stored : 'system'
}

function resolveTheme(themePreference: Theme): 'light' | 'dark' {
  if (themePreference !== 'system' || typeof window === 'undefined') {
    return themePreference === 'dark' ? 'dark' : 'light'
  }

  return window.matchMedia(THEME_MEDIA_QUERY).matches ? 'dark' : 'light'
}

function applyTheme(themePreference: Theme) {
  if (typeof document === 'undefined') return
  const resolvedTheme = resolveTheme(themePreference)
  document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  document.documentElement.dataset.theme = resolvedTheme
}

function syncSystemThemeListener(themePreference: Theme) {
  if (typeof window === 'undefined') return

  if (themeMediaQuery === null) {
    themeMediaQuery = window.matchMedia(THEME_MEDIA_QUERY)
  }

  if (themeMediaListener !== null) {
    themeMediaQuery.removeEventListener('change', themeMediaListener)
    themeMediaListener = null
  }

  if (themePreference !== 'system') return

  themeMediaListener = () => applyTheme('system')
  themeMediaQuery.addEventListener('change', themeMediaListener)
}

function scheduleRealtimeRefresh(loadData: () => Promise<void>) {
  realtimeRefreshQueued = true
  if (realtimeRefreshInFlight || realtimeRefreshTimeoutId !== null) {
    return
  }

  realtimeRefreshTimeoutId = window.setTimeout(() => {
    realtimeRefreshTimeoutId = null
    if (!realtimeRefreshQueued) {
      return
    }

    realtimeRefreshQueued = false
    realtimeRefreshInFlight = true
    void loadData().finally(() => {
      realtimeRefreshInFlight = false
      if (realtimeRefreshQueued) {
        scheduleRealtimeRefresh(loadData)
      }
    })
  }, 250)
}

function closeRealtimeStream() {
  realtimeSource?.close()
  realtimeSource = null

  if (realtimeRefreshTimeoutId !== null) {
    window.clearTimeout(realtimeRefreshTimeoutId)
    realtimeRefreshTimeoutId = null
  }

  realtimeRefreshQueued = false
  realtimeRefreshInFlight = false
}

function relativeTime(value: string | null | undefined): string {
  if (!value) return '—'
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function mapTasks(model: VaultReadModel): Task[] {
  return model.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.body,
    createdBy: task.createdBy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    status: task.status,
    priority: task.priority,
    projectId: task.projectId,
    boardId: task.boardId,
    columnId: task.columnId,
    assigneeId: task.assignee || undefined,
    progress: task.progress,
    executionStartedAt: task.executionStartedAt ?? undefined,
    executionNotes: task.executionNotes ?? undefined,
    history: task.history.map((entry) => ({
      at: entry.at,
      actor: entry.actor,
      action: entry.action,
      ...(entry.fromStatus === undefined ? {} : { fromStatus: entry.fromStatus }),
      ...(entry.toStatus === undefined ? {} : { toStatus: entry.toStatus }),
    })),
    approvalNeeded: task.approvalNeeded,
    approvalOutcome: task.approvalOutcome,
    approvalRequestedBy: task.approvalRequestedBy ?? undefined,
    approvedBy: task.approvedBy ?? undefined,
    approvedAt: task.approvedAt ?? undefined,
    result: task.result ?? undefined,
    completedAt: task.completedAt ?? undefined,
    tokensUsed: task.tokensUsed ?? null,
    model: task.model ?? null,
    costUsd: task.costUsd ?? null,
    parentTaskId: task.parentTaskId ?? undefined,
    sourceIssueId: task.sourceIssueId ?? undefined,
    dependsOn: [...task.dependsOn],
    links: task.links.map(link => ({ projectId: link.projectId, threadId: link.threadId })),
    lockedBy: task.lockedBy ?? undefined,
    lockedAt: task.lockedAt ?? undefined,
    lockExpiresAt: task.lockExpiresAt ?? undefined,
    isStale: task.isStale,
    approvalIds: [...task.approvalIds],
    lastSeen: relativeTime(task.heartbeatAt ?? task.updatedAt),
    requestedApprovalTime: task.approvalState.requestedAt ? relativeTime(task.approvalState.requestedAt) : undefined,
    approvalReason: task.approvalState.reason ?? undefined,
    blockedReason: task.blockedReason ?? undefined,
    blockedTime: task.blockedSince ? relativeTime(task.blockedSince) : undefined,
    nextRunAt: task.nextRunAt ?? null,
    cronSchedule: task.cronSchedule ?? null,
    tags: [...task.tags],
  }))
}

function mapProjects(model: VaultReadModel): Project[] {
  return model.projects.map((project) => ({
    id: project.id,
    name: project.name,
    boardId: project.boardIds[0],
    lastActive: model.tasks.some((task) => task.projectId === project.id && task.status !== 'done' && task.status !== 'cancelled'),
    codebaseRoot: project.codebases[0]?.path ?? null,
    description: project.description ?? null,
    budget: project.budget ?? null,
    deadline: project.deadline ?? null,
    status: project.status ?? null,
    links: [...project.links],
    attachments: [...project.attachments],
    docs: model.docs
      .filter((doc) => doc.projectId === project.id)
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        docType: doc.docType,
        status: doc.status,
        visibility: doc.visibility,
        updatedAt: doc.updatedAt,
        sourcePath: doc.sourcePath,
      })),
  }))
}

function mapAgents(model: VaultReadModel, sessions: ReadonlyArray<ActiveAgentSession>): Agent[] {
  return model.agents.map((agent) => {
    const session = sessions.find((entry) => entry.agentName.replace(/#\d+$/, '') === agent.id || entry.agentName === agent.id)
    const waitingTask = model.tasks.find((task) => task.assignee === agent.id && task.status === 'waiting-approval')
    const activeTask = model.tasks.find((task) => task.assignee === agent.id && task.status === 'in-progress')

    let state: Agent['state'] = 'idle'
    if (waitingTask) state = 'waiting'
    else if (session && session.idleSeconds < 120) state = 'active'
    else if (session) state = 'stale'
    else if (activeTask) state = 'active'

    return {
      id: agent.id,
      name: agent.name,
      accountId: agent.accountId,
      state,
      lastHeartbeat: session ? relativeTime(session.lastSeenAt) : 'offline',
      role: agent.role,
      roles: [...agent.roles],
      provider: agent.provider,
      apiKeyRef: agent.apiKeyRef,
      monthlyBudgetUsd: agent.monthlyBudgetUsd,
      aliases: [...agent.aliases],
      runCommand: agent.runCommand,
      runMode: agent.runMode,
      capabilities: [...agent.capabilities],
      approvalRequiredFor: [...agent.approvalRequiredFor],
      skillFile: agent.skillFile,
    }
  })
}

function mapAuditLogs(model: VaultReadModel): AuditLog[] {
  return [...model.auditNotes]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 25)
    .map((note) => ({
      id: note.id,
      time: relativeTime(note.createdAt),
      action: note.source,
      description: note.message,
      taskId: note.taskId,
      agentId: note.source.startsWith('agent-') ? note.source : undefined,
      userId: !note.source.startsWith('agent-') ? note.source : undefined,
    }))
}

async function readSnapshot() {
  const [settings, model, sessions] = await Promise.all([
    relayhqApi.getSettings(),
    relayhqApi.getReadModel(),
    relayhqApi.getActiveAgents().catch(() => []),
  ])

  const emptyModel: VaultReadModel = {
    workspaces: [],
    projects: [],
    boards: [],
    columns: [],
    tasks: [],
    issues: [],
    approvals: [],
    auditNotes: [],
    docs: [],
    agents: [],
  }

  if (!settings.isValid) {
    return {
      settings,
      model: emptyModel,
      tasks: [],
      projects: [],
      columns: [],
      auditNotes: [],
      agents: [],
      auditLogs: [],
      showOnboarding: true,
    }
  }

  const projects = mapProjects(model)
  const tasks = mapTasks(model)

  return {
    settings,
    model,
    tasks,
    projects,
    columns: model.columns,
    auditNotes: model.auditNotes,
    agents: mapAgents(model, sessions),
    auditLogs: mapAuditLogs(model),
    showOnboarding: settings.availableWorkspaces.length === 0 || projects.length === 0,
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  tasks: [],
  agents: [],
  projects: [],
  columns: [],
  auditNotes: [],
  settings: null,
  showOnboarding: false,
  auditLogs: [],
  lastFetched: null,
  selectedTaskId: null,
  isDetailPanelOpen: false,
  isNewTaskModalOpen: false,
  selectedProjectId: null,
  isLoading: false,
  error: null,
  isMutating: false,
  mutationError: null,
  refreshIntervalId: null,
  themePreference: readStoredTheme(),

  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
    applyTheme(theme)
    syncSystemThemeListener(theme)
    set({ themePreference: theme })
  },
  openTaskDetail: (taskId) => set({ selectedTaskId: taskId, isDetailPanelOpen: true }),
  closeTaskDetail: () => set({ selectedTaskId: null, isDetailPanelOpen: false }),
  openNewTaskModal: () => set({ isNewTaskModalOpen: true }),
  closeNewTaskModal: () => set({ isNewTaskModalOpen: false }),

  fetchReadModel: async () => {
    await get().loadData()
  },

  startRealtime: () => {
    const { loadData } = get()
    if (typeof window === 'undefined') return

    if (typeof EventSource === 'undefined') {
      get().startPolling()
      return
    }

    get().stopPolling()

    if (realtimeSource !== null) return

    void loadData()

    const source = new EventSource(`${getRelayHQApiBaseUrl()}/api/realtime/stream`)
    realtimeSource = source
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { kind?: string }
        if (payload.kind === 'vault.changed') {
          scheduleRealtimeRefresh(loadData)
        }
      } catch {
        scheduleRealtimeRefresh(loadData)
      }
    }
  },

  stopRealtime: () => {
    closeRealtimeStream()
    get().stopPolling()
  },

  loadData: async () => {
    if (snapshotLoadInFlight !== null) return snapshotLoadInFlight

    set({ isLoading: true, error: null })
    snapshotLoadInFlight = (async () => {
      try {
        const snapshot = await readSnapshot()
        set({
          settings: snapshot.settings,
          tasks: snapshot.tasks,
          projects: snapshot.projects,
          columns: snapshot.columns,
          auditNotes: snapshot.model.auditNotes,
          agents: snapshot.agents,
          auditLogs: snapshot.auditLogs,
          lastFetched: new Date(),
          showOnboarding: snapshot.showOnboarding,
          isLoading: false,
        })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Unable to load RelayHQ data.',
          settings: null,
          showOnboarding: false,
          isLoading: false,
          lastFetched: null,
        })
      }
    })().finally(() => {
      snapshotLoadInFlight = null
    })

    return snapshotLoadInFlight
  },

  startPolling: () => {
    const { refreshIntervalId, loadData } = get()
    if (refreshIntervalId !== null) return

    const run = () => {
      if (document.visibilityState !== 'visible') return
      void loadData()
    }

    run()
    const intervalId = window.setInterval(run, 5000)
    set({ refreshIntervalId: intervalId })
  },

  stopPolling: () => {
    const { refreshIntervalId } = get()
    if (refreshIntervalId !== null) {
      window.clearInterval(refreshIntervalId)
      set({ refreshIntervalId: null })
    }
  },

  addTask: async (payload) => {
    set({ isMutating: true, mutationError: null })
    try {
      const project = get().projects.find((entry) => entry.id === payload.projectId)
      const boardId = payload.boardId || project?.boardId
      const todoColumnId = get().columns.find((column) => column.boardId === boardId && column.position === 0)?.id

      if (!boardId || !todoColumnId) {
        throw new Error('Unable to resolve the default board column for this project.')
      }

      await relayhqApi.createTask({
        title: payload.title,
        projectId: payload.projectId,
        boardId,
        columnId: todoColumnId,
        priority: payload.priority,
        ...(payload.assigneeId ? { assignee: payload.assigneeId } : {}),
        ...(payload.requiredCapability ? { requiredCapability: payload.requiredCapability } : {}),
        ...(payload.cronSchedule ? { cron_schedule: payload.cronSchedule } : {}),
        objective: payload.objective ?? (payload.description && payload.description.trim().length >= 50 ? payload.description : `${payload.description ?? payload.title} — created from the React web workspace flow.`),
        acceptanceCriteria: payload.acceptanceCriteria ?? ['Task is created in the canonical vault', 'Task is visible to the React web app'],
        constraints: payload.constraints,
        contextFiles: payload.contextFiles ?? ['web/src/api/client.ts'],
      })
      await get().loadData()
      set({ isNewTaskModalOpen: false, isMutating: false })
    } catch (error) {
      set({ isMutating: false, mutationError: error instanceof Error ? error.message : 'Unable to create task.' })
      throw error
    }
  },

  approveTask: async (taskId) => {
    set({ isMutating: true, mutationError: null })
    try {
      await relayhqApi.approveTask(taskId, 'human-user')
      await get().loadData()
      set({ selectedTaskId: null, isDetailPanelOpen: false, isMutating: false })
    } catch (error) {
      set({ isMutating: false, mutationError: error instanceof Error ? error.message : 'Unable to approve task.' })
      throw error
    }
  },

  rejectTask: async (taskId, reason) => {
    set({ isMutating: true, mutationError: null })
    try {
      await relayhqApi.rejectTask(taskId, 'human-user', reason)
      await get().loadData()
      set({ selectedTaskId: null, isDetailPanelOpen: false, isMutating: false })
    } catch (error) {
      set({ isMutating: false, mutationError: error instanceof Error ? error.message : 'Unable to reject task.' })
      throw error
    }
  },

  startAutoRun: async (taskId) => {
    set({ isMutating: true, mutationError: null })
    try {
      const task = get().tasks.find(entry => entry.id === taskId)
      const assigneeId = task?.assigneeId
      if (!assigneeId || assigneeId === 'unassigned') {
        throw new Error('Task must have an assignee before auto-run can start.')
      }

      await relayhqApi.runAgent(assigneeId, { taskId })
      await get().loadData()
      set({ isMutating: false })
    } catch (error) {
      set({ isMutating: false, mutationError: error instanceof Error ? error.message : 'Unable to start auto-run.' })
      throw error
    }
  },

  moveTaskToStatus: async (taskId, status, actorId = 'human-user') => {
    set({ isMutating: true, mutationError: null })
    try {
      const patch: Record<string, unknown> = { status }
      if (status === 'review') {
        patch.column = 'review'
      } else if (status === 'done') {
        patch.column = 'done'
        patch.progress = 100
      } else if (status === 'in-progress') {
        patch.column = 'in-progress'
      } else if (status === 'blocked') {
        patch.column = 'review'
      } else {
        patch.column = 'todo'
      }

      await relayhqApi.patchTask(taskId, { actorId, patch } as never)
      await get().loadData()
      set({ isMutating: false })
    } catch (error) {
      set({ isMutating: false, mutationError: error instanceof Error ? error.message : 'Unable to move task.' })
      throw error
    }
  },
}))

if (typeof window !== 'undefined') {
  const initialTheme = useAppStore.getState().themePreference
  applyTheme(initialTheme)
  syncSystemThemeListener(initialTheme)
}
