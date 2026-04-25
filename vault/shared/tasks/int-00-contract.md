---
id: "int-00-contract"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "done"
priority: "critical"
title: "Định nghĩa API contract giữa BE và FE"
assignee: null
created_by: "@amas"
created_at: "2026-04-24T00:00:00Z"
updated_at: "2026-04-25T00:00:00Z"
heartbeat_at: null
execution_started_at: null
execution_notes: null
progress: 100
approval_needed: false
approval_requested_by: null
approval_reason: null
approved_by: null
approved_at: null
approval_outcome: "pending"
blocked_reason: null
blocked_since: null
result: "Defined and implemented the shared BE/FE API contract in web/src/api/contract.ts."
completed_at: "2026-04-25T00:00:00Z"
parent_task_id: null
depends_on: []
tags: ["contract", "integration", "critical-path"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# Định nghĩa API contract giữa BE và FE

Task này làm TRƯỚC tất cả integration tasks. Output là một file TypeScript types dùng chung cho cả BE lẫn FE — khi cả hai đồng ý contract này, họ có thể làm song song mà không sợ break nhau.

## Tại sao cần làm đầu tiên

- FE (`web/src/types/index.ts`) đang dùng types tự định nghĩa từ mock data
- BE (`app/server/models/read-model.ts`) có types riêng
- Hai bên chưa align — integration sẽ fail nếu không sync trước

## Deliverable

Tạo file `web/src/api/contract.ts` — source of truth cho API shapes:

```ts
// GET /api/vault/read-model
export interface ReadModelResponse {
  workspaces: Workspace[]
  projects: Project[]
  boards: Board[]
  columns: Column[]
  tasks: Task[]
  agents: Agent[]
  approvals: Approval[]
  auditNotes: AuditNote[]
}

// Task shape từ BE
export interface Task {
  id: string
  type: 'task'
  workspaceId: string
  projectId: string
  boardId: string
  column: 'todo' | 'in-progress' | 'review' | 'done'
  status: 'todo' | 'in-progress' | 'blocked' | 'waiting-approval' | 'done' | 'cancelled'
  priority: 'critical' | 'high' | 'medium' | 'low'
  title: string
  assignee?: string
  progress: number
  heartbeatAt?: string
  executionStartedAt?: string
  approvalNeeded: boolean
  approvalReason?: string
  approvalOutcome: 'pending' | 'approved' | 'rejected'
  approvedBy?: string
  blockedReason?: string
  blockedSince?: string
  result?: string
  completedAt?: string
  tags: string[]
  sourcePath: string
}

export interface Agent {
  id: string
  name: string
  role: string
  status: string
  capabilities: string[]
  sourcePath: string
}

export interface Project {
  id: string
  name: string
  workspaceId: string
}

export interface AuditNote {
  id: string
  message: string
  source: string
  createdAt: string
  taskId?: string
  sourcePath: string
}

// POST /api/vault/tasks
export interface CreateTaskInput {
  title: string
  description?: string
  priority: Task['priority']
  projectId: string
  boardId: string
  assignee?: string
  approvalNeeded?: boolean
  tags?: string[]
}

// POST /api/vault/tasks/[id]/approve
export interface ApproveTaskInput {
  actorId: string
}

// POST /api/vault/tasks/[id]/reject
export interface RejectTaskInput {
  actorId: string
  reason?: string
}
```

## Cách verify

1. Gọi `GET http://localhost:3000/api/vault/read-model`
2. So sánh response shape với types trên
3. Fix bất kỳ mismatch nào (field name khác, missing field)
4. Update `web/src/types/index.ts` để re-export từ contract

## Notes

- Source of truth: `app/server/models/read-model.ts` + thực tế response
- FE types hiện tại (`web/src/types/index.ts`) cần update sau bước này
- Một khi contract xong, BE và FE có thể làm song song không lo break
