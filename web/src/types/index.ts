export type TaskStatus = 'todo' | 'in-progress' | 'waiting-approval' | 'blocked' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
export type AgentState = 'idle' | 'active' | 'waiting' | 'stale'
export type Theme = 'light' | 'dark' | 'system'

export interface Agent {
  id: string
  name: string
  state: AgentState
  lastHeartbeat: string
  role?: string
  roles?: ReadonlyArray<string>
  capabilities?: ReadonlyArray<string>
  approvalRequiredFor?: ReadonlyArray<string>
  skillFile?: string
}

export interface Project {
  id: string
  name: string
  boardId?: string
  lastActive: boolean
}

export interface Task {
  id: string
  title: string
  description?: string
   createdBy?: string
   createdAt?: string
   updatedAt?: string
   status: TaskStatus
   priority: TaskPriority
   projectId: string
   boardId: string
   columnId?: string
   assigneeId?: string
   progress: number
   executionStartedAt?: string
   executionNotes?: string
   approvalNeeded?: boolean
   approvalOutcome?: 'approved' | 'rejected' | 'pending'
   approvalRequestedBy?: string
   approvedBy?: string
   approvedAt?: string
   result?: string
   completedAt?: string
   parentTaskId?: string
   sourceIssueId?: string
   dependsOn?: string[]
   links?: Array<{ projectId: string; threadId: string }>
   lockedBy?: string
   lockedAt?: string
   lockExpiresAt?: string
   isStale?: boolean
   approvalIds?: string[]
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
