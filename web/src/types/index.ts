export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'scheduled' | 'review' | 'waiting-approval' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
export type AgentState = 'idle' | 'active' | 'waiting' | 'stale'
export type Theme = 'light' | 'dark' | 'system'

export interface Agent {
  id: string
  name: string
  accountId?: string | null
  state: AgentState
  lastHeartbeat: string
  role?: string
  roles?: ReadonlyArray<string>
  provider?: string
  apiKeyRef?: string | null
  monthlyBudgetUsd?: number | null
  capabilities?: ReadonlyArray<string>
  approvalRequiredFor?: ReadonlyArray<string>
  skillFile?: string
}

export interface Project {
  id: string
  name: string
  boardId?: string
  lastActive: boolean
  codebaseRoot?: string | null
  description?: string | null
  budget?: string | null
  deadline?: string | null
  status?: string | null
  links: ReadonlyArray<ProjectLink>
  attachments: ReadonlyArray<ProjectAttachment>
  docs: ReadonlyArray<ProjectDoc>
}

export interface ProjectLink {
  label: string
  url: string
}

export interface ProjectAttachment {
  label: string
  url: string
  type: string
  addedAt: string
}

export interface ProjectDoc {
  id: string
  title: string
  docType: string
  status: string
  visibility: string
  updatedAt: string
  sourcePath: string
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
  history?: Array<{ at: string; actor: string; action: string; fromStatus?: TaskStatus; toStatus?: TaskStatus }>
  approvalNeeded?: boolean
  approvalOutcome?: 'approved' | 'rejected' | 'pending'
  approvalRequestedBy?: string
  approvedBy?: string
  approvedAt?: string
  result?: string
  completedAt?: string
  tokensUsed?: number | null
  model?: string | null
  costUsd?: number | null
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
  nextRunAt?: string | null
  cronSchedule?: string | null
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
