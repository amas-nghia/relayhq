export type TaskStatus = 'todo' | 'in-progress' | 'waiting-approval' | 'blocked' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
export type AgentState = 'idle' | 'active' | 'waiting' | 'stale'

export interface Agent {
  id: string
  name: string
  state: AgentState
  lastHeartbeat: string
}

export interface Project {
  id: string
  name: string
  lastActive: boolean
}

export interface Task {
  id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  projectId: string
  boardId: string
  assigneeId?: string
  progress: number
  lastSeen?: string
  requestedApprovalTime?: string
  approvalReason?: string
  blockedReason?: string
  blockedTime?: string
  tags: string[]
}

export interface AuditLog {
  id: string
  time: string
  agentId?: string
  userId?: string
  action: string
  description: string
  taskId?: string
}
