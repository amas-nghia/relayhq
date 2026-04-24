import { create } from 'zustand'

import { relayhqApi } from '../api/client'
import type { ActiveAgentSession, VaultReadModel } from '../api/contract'
import type { Agent, AuditLog, Project, Task } from '../types'

interface AppState {
  tasks: Task[]
  agents: Agent[]
  projects: Project[]
  auditLogs: AuditLog[]
  selectedTaskId: string | null
  isDetailPanelOpen: boolean
  isNewTaskModalOpen: boolean
  selectedProjectId: string | null
  isLoading: boolean
  error: string | null
  isMutating: boolean
  mutationError: string | null
  refreshIntervalId: number | null

  setSelectedProjectId: (id: string | null) => void
  openTaskDetail: (taskId: string) => void
  closeTaskDetail: () => void
  openNewTaskModal: () => void
  closeNewTaskModal: () => void
  loadData: () => Promise<void>
  startPolling: () => void
  stopPolling: () => void
  addTask: (payload: { title: string; description?: string; projectId: string; boardId: string; assigneeId?: string; priority: Task['priority'] }) => Promise<void>
  approveTask: (taskId: string) => Promise<void>
  rejectTask: (taskId: string, reason: string) => Promise<void>
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
    status: task.status,
    priority: task.priority,
    projectId: task.projectId,
    boardId: task.boardId,
    assigneeId: task.assignee || undefined,
    progress: task.progress,
    lastSeen: relativeTime(task.heartbeatAt ?? task.updatedAt),
    requestedApprovalTime: task.approvalState.requestedAt ? relativeTime(task.approvalState.requestedAt) : undefined,
    approvalReason: task.approvalState.reason ?? undefined,
    blockedReason: task.blockedReason ?? undefined,
    blockedTime: task.blockedSince ? relativeTime(task.blockedSince) : undefined,
    tags: [...task.tags],
  }))
}

function mapProjects(model: VaultReadModel): Project[] {
  return model.projects.map((project) => ({
    id: project.id,
    name: project.name,
    lastActive: model.tasks.some((task) => task.projectId === project.id && task.status !== 'done' && task.status !== 'cancelled'),
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
      state,
      lastHeartbeat: session ? relativeTime(session.lastSeenAt) : 'offline',
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
  const [model, sessions] = await Promise.all([
    relayhqApi.getReadModel(),
    relayhqApi.getActiveAgents().catch(() => []),
  ])

  return {
    model,
    tasks: mapTasks(model),
    projects: mapProjects(model),
    agents: mapAgents(model, sessions),
    auditLogs: mapAuditLogs(model),
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  tasks: [],
  agents: [],
  projects: [],
  auditLogs: [],
  selectedTaskId: null,
  isDetailPanelOpen: false,
  isNewTaskModalOpen: false,
  selectedProjectId: null,
  isLoading: false,
  error: null,
  isMutating: false,
  mutationError: null,
  refreshIntervalId: null,

  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  openTaskDetail: (taskId) => set({ selectedTaskId: taskId, isDetailPanelOpen: true }),
  closeTaskDetail: () => set({ selectedTaskId: null, isDetailPanelOpen: false }),
  openNewTaskModal: () => set({ isNewTaskModalOpen: true }),
  closeNewTaskModal: () => set({ isNewTaskModalOpen: false }),

  loadData: async () => {
    set({ isLoading: true, error: null })
    try {
      const snapshot = await readSnapshot()
      set({
        tasks: snapshot.tasks,
        projects: snapshot.projects,
        agents: snapshot.agents,
        auditLogs: snapshot.auditLogs,
        isLoading: false,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Unable to load RelayHQ data.',
        isLoading: false,
      })
    }
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
      await relayhqApi.createTask({
        title: payload.title,
        projectId: payload.projectId,
        boardId: payload.boardId,
        column: 'todo',
        priority: payload.priority,
        assignee: payload.assigneeId ?? 'human-user',
        objective: payload.description && payload.description.trim().length >= 50 ? payload.description : `${payload.description ?? payload.title} — created from the React web workspace flow.`,
        acceptanceCriteria: ['Task is created in the canonical vault', 'Task is visible to the React web app'],
        contextFiles: ['web/src/api/client.ts'],
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
}))
