export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'waiting-approval' | 'done' | 'cancelled'
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'
export type ApprovalOutcome = 'approved' | 'rejected' | 'pending'

export interface ReadModelLink {
  readonly projectId: string
  readonly threadId: string
}

export interface ReadModelApprovalState {
  readonly status: 'not-needed' | 'pending' | 'approved' | 'rejected'
  readonly needed: boolean
  readonly outcome: ApprovalOutcome
  readonly requestedBy: string | null
  readonly requestedAt: string | null
  readonly decidedBy: string | null
  readonly decidedAt: string | null
  readonly reason: string | null
}

export interface ReadModelWorkspace {
  readonly id: string
  readonly type: 'workspace'
  readonly name: string
  readonly ownerIds: ReadonlyArray<string>
  readonly memberIds: ReadonlyArray<string>
  readonly projectIds: ReadonlyArray<string>
  readonly boardIds: ReadonlyArray<string>
  readonly columnIds: ReadonlyArray<string>
  readonly taskIds: ReadonlyArray<string>
  readonly approvalIds: ReadonlyArray<string>
  readonly createdAt: string
  readonly updatedAt: string
  readonly body: string
  readonly sourcePath: string
}

export interface ProjectCodebase {
  readonly name: string
  readonly path: string
  readonly tech?: string
  readonly primary?: boolean
}

export interface ReadModelProject {
  readonly id: string
  readonly type: 'project'
  readonly workspaceId: string
  readonly name: string
  readonly codebases: ReadonlyArray<ProjectCodebase>
  readonly boardIds: ReadonlyArray<string>
  readonly columnIds: ReadonlyArray<string>
  readonly taskIds: ReadonlyArray<string>
  readonly approvalIds: ReadonlyArray<string>
  readonly createdAt: string
  readonly updatedAt: string
  readonly body: string
  readonly sourcePath: string
}

export interface ReadModelBoard {
  readonly id: string
  readonly type: 'board'
  readonly workspaceId: string
  readonly projectId: string
  readonly name: string
  readonly columnIds: ReadonlyArray<string>
  readonly taskIds: ReadonlyArray<string>
  readonly approvalIds: ReadonlyArray<string>
  readonly createdAt: string
  readonly updatedAt: string
  readonly body: string
  readonly sourcePath: string
}

export interface ReadModelColumn {
  readonly id: string
  readonly type: 'column'
  readonly workspaceId: string
  readonly projectId: string
  readonly boardId: string
  readonly name: string
  readonly position: number
  readonly taskIds: ReadonlyArray<string>
  readonly createdAt: string
  readonly updatedAt: string
  readonly body: string
  readonly sourcePath: string
}

export interface ReadModelTask {
  readonly id: string
  readonly type: 'task'
  readonly workspaceId: string
  readonly projectId: string
  readonly boardId: string
  readonly columnId: string
  readonly status: TaskStatus
  readonly priority: TaskPriority
  readonly title: string
  readonly assignee: string
  readonly createdBy: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly heartbeatAt: string | null
  readonly executionStartedAt: string | null
  readonly executionNotes: string | null
  readonly progress: number
  readonly approvalNeeded: boolean
  readonly approvalRequestedBy: string | null
  readonly approvalReason: string | null
  readonly approvedBy: string | null
  readonly approvedAt: string | null
  readonly approvalOutcome: ApprovalOutcome
  readonly blockedReason: string | null
  readonly blockedSince: string | null
  readonly result: string | null
  readonly completedAt: string | null
  readonly parentTaskId: string | null
  readonly sourceIssueId?: string | null
  readonly dependsOn: ReadonlyArray<string>
  readonly tags: ReadonlyArray<string>
  readonly links: ReadonlyArray<ReadModelLink>
  readonly lockedBy: string | null
  readonly lockedAt: string | null
  readonly lockExpiresAt: string | null
  readonly isStale: boolean
  readonly approvalIds: ReadonlyArray<string>
  readonly approvalState: ReadModelApprovalState
  readonly body: string
  readonly sourcePath: string
}

export interface ReadModelApproval {
  readonly id: string
  readonly type: 'approval'
  readonly workspaceId: string
  readonly projectId: string
  readonly boardId: string
  readonly taskId: string
  readonly status: string
  readonly outcome: ApprovalOutcome
  readonly requestedBy: string | null
  readonly requestedAt: string | null
  readonly decidedBy: string | null
  readonly decidedAt: string | null
  readonly reason: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly body: string
  readonly sourcePath: string
}

export interface ReadModelAuditNote {
  readonly id: string
  readonly type: 'audit-note'
  readonly taskId: string
  readonly message: string
  readonly source: string
  readonly confidence: number
  readonly createdAt: string
  readonly sourcePath: string
}

export interface ReadModelIssue {
  readonly id: string
  readonly type: 'issue'
  readonly workspaceId: string
  readonly projectId: string
  readonly status: string
  readonly priority: TaskPriority
  readonly title: string
  readonly reportedBy: string
  readonly discoveredDuringTaskId: string | null
  readonly linkedTaskIds: ReadonlyArray<string>
  readonly tags: ReadonlyArray<string>
  readonly createdAt: string
  readonly updatedAt: string
  readonly body: string
  readonly sourcePath: string
}

export interface ReadModelDoc {
  readonly id: string
  readonly type: 'doc'
  readonly docType: string
  readonly workspaceId: string
  readonly projectId: string | null
  readonly title: string
  readonly status: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly tags: ReadonlyArray<string>
  readonly body: string
  readonly sourcePath: string
}

export interface ReadModelAgent {
  readonly id: string
  readonly type: 'agent'
  readonly workspaceId: string
  readonly name: string
  readonly role: string
  readonly provider: string
  readonly model: string
  readonly capabilities: ReadonlyArray<string>
  readonly taskTypesAccepted: ReadonlyArray<string>
  readonly approvalRequiredFor: ReadonlyArray<string>
  readonly cannotDo: ReadonlyArray<string>
  readonly accessibleBy: ReadonlyArray<string>
  readonly skillFile: string
  readonly status: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly body: string
  readonly sourcePath: string
}

export interface VaultReadModel {
  readonly workspaces: ReadonlyArray<ReadModelWorkspace>
  readonly projects: ReadonlyArray<ReadModelProject>
  readonly boards: ReadonlyArray<ReadModelBoard>
  readonly columns: ReadonlyArray<ReadModelColumn>
  readonly tasks: ReadonlyArray<ReadModelTask>
  readonly issues: ReadonlyArray<ReadModelIssue>
  readonly approvals: ReadonlyArray<ReadModelApproval>
  readonly auditNotes: ReadonlyArray<ReadModelAuditNote>
  readonly docs: ReadonlyArray<ReadModelDoc>
  readonly agents: ReadonlyArray<ReadModelAgent>
}

export interface ActiveAgentSession {
  readonly agentName: string
  readonly lastSeenAt: string
  readonly idleSeconds: number
}

export interface AgentContextProjectSummary {
  readonly id: string
  readonly name: string
  readonly boardCount: number
  readonly openIssueCount: number
  readonly codebases: ReadonlyArray<ProjectCodebase>
}

export interface AgentContextBoardSummary {
  readonly id: string
  readonly name: string
  readonly columnSummary: ReadonlyArray<{ id: string; name: string; taskCount: number }>
}

export interface AgentContextResponse {
  readonly vaultRoot?: string
  readonly workspaceId: string | null
  readonly workspaceName: string | null
  readonly projects: ReadonlyArray<AgentContextProjectSummary>
  readonly openTaskCount: number
  readonly pendingApprovalCount: number
  readonly boardSummary: ReadonlyArray<AgentContextBoardSummary>
  readonly activeSessions: ReadonlyArray<ActiveAgentSession>
}

export interface ProjectIndexCodebaseStatus {
  readonly name: string
  readonly path: string
  readonly resolvedPath: string
  readonly status: 'missing-path' | 'not-indexed' | 'indexed'
  readonly fileCount: number
  readonly lastIndexedAt: string | null
  readonly primary: boolean
  readonly tech?: string
}

export interface ProjectIndexStatusResponse {
  readonly codebase: { readonly name: string; readonly path: string } | null
  readonly resolvedPath: string | null
  readonly status: 'unconfigured' | 'missing-path' | 'not-indexed' | 'indexed'
  readonly fileCount: number
  readonly lastIndexedAt: string | null
  readonly warnings: ReadonlyArray<string>
  readonly codebases: ReadonlyArray<ProjectIndexCodebaseStatus>
}

export interface VaultDocEnvelope<T> {
  readonly success: boolean
  readonly data: T
  readonly error: string | null
}
