---
id: "web-03-task-mutations-api"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "done"
priority: "high"
title: "Wire task mutations vào real API (create, approve, reject)"
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
result: "Wired create, approve, and reject mutations to the live vault API and refetched state after each mutation."
completed_at: "2026-04-25T00:00:00Z"
parent_task_id: null
depends_on: ["web-01-api-client", "be-02-verify-endpoints"]
tags: ["web", "mutations", "ui-migration"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# Wire task mutations vào real API

Hiện tại `approveTask`, `rejectTask`, `addTask` trong store chỉ update local state. Cần gọi API thực sự trước, rồi update state từ response.

## Các mutations cần wire

### Create task (NewTaskModal)

```ts
addTask: async (form: NewTaskForm) => {
  const task = await api.createTask(form)  // POST /api/vault/tasks
  set(state => ({ tasks: [...state.tasks, task] }))
}
```

Form fields cần map sang vault schema:
- `title`, `description`, `priority`, `projectId`, `boardId`, `assigneeId`
- `column: 'todo'`, `status: 'todo'` (default)
- `approval_needed`: từ toggle trong form

### Approve task

```ts
approveTask: async (taskId: string) => {
  await api.approveTask(taskId)            // POST /api/vault/tasks/[id]/approve
  // Refetch hoặc optimistic update
  await get().fetchReadModel()
}
```

### Reject task

```ts
rejectTask: async (taskId: string, reason?: string) => {
  await api.rejectTask(taskId, reason)     // POST /api/vault/tasks/[id]/reject
  await get().fetchReadModel()
}
```

### Update task (reassign, mark blocked)

```ts
updateTask: async (taskId: string, updates: Partial<Task>) => {
  await api.updateTask(taskId, updates)    // PATCH /api/vault/tasks/[id]
  await get().fetchReadModel()
}
```

## UI changes

### NewTaskModal
- Submit button: loading state khi đang POST
- Error state: hiện error message nếu API thất bại
- Success: đóng modal + toast "Task created"

### Approve/Reject buttons (DetailPanel + ApprovalsView)
- Loading spinner khi đang POST
- Disable buttons sau khi click (prevent double-submit)
- Error toast nếu thất bại

### Reject flow
- Hiện text input cho reason trước khi submit (đúng với spec)
- "Confirm Reject" / "Cancel" buttons

## Notes

- Optimistic update OK cho approve/reject (UX nhanh hơn)
- Luôn refetch read-model sau mutation để đảm bảo sync với vault
