---
id: "web-02-real-data-store"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "todo"
status: "todo"
priority: "critical"
title: "Thay mock data bằng real API + polling"
assignee: null
created_by: "@amas"
created_at: "2026-04-24T00:00:00Z"
updated_at: "2026-04-24T00:00:00Z"
heartbeat_at: null
execution_started_at: null
execution_notes: null
progress: 0
approval_needed: false
approval_requested_by: null
approval_reason: null
approved_by: null
approved_at: null
approval_outcome: "pending"
blocked_reason: null
blocked_since: null
result: null
completed_at: null
parent_task_id: null
depends_on: ["web-01-api-client", "be-02-verify-endpoints"]
tags: ["web", "store", "ui-migration"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# Thay mock data bằng real API + polling

Cập nhật Zustand store (`web/src/store/appStore.ts`) để load data từ API thay vì mock, và poll định kỳ để giữ data fresh.

## Việc cần làm

### 1. Store state mới

Thêm vào store:
```ts
agents: Agent[]
projects: Project[]
isLoading: boolean
lastFetched: Date | null
fetchReadModel: () => Promise<void>
```

### 2. Fetch read-model

```ts
fetchReadModel: async () => {
  const data = await api.getReadModel()
  set({ tasks: data.tasks, agents: data.agents, projects: data.projects, lastFetched: new Date() })
}
```

### 3. Polling

Trong `Shell.tsx` hoặc một hook riêng `usePolling.ts`:
- Poll `GET /api/vault/read-model` mỗi **5 giây**
- Chỉ update state nếu data thực sự thay đổi (compare hash hoặc updatedAt)
- Dừng poll khi tab bị blur, resume khi focus lại (Page Visibility API)

### 4. Xóa mock data imports

Sau khi store được wire up:
- Xóa `import { mockAgents, mockProjects } from '../mock/data'` khỏi tất cả components
- Lấy agents và projects từ store thay vì mock

### 5. Stale detection

Thêm logic tính stale vào store hoặc selector:
```ts
isTaskStale: (task: Task) => {
  if (!task.heartbeat_at || task.status !== 'in-progress') return false
  const diff = Date.now() - new Date(task.heartbeat_at).getTime()
  return diff > 10 * 60 * 1000 // 10 phút
}
```

Thêm `isStale` vào TaskCard và task card state rendering.

## Notes

- `mock/data.ts` vẫn giữ lại cho dev fallback, chỉ không import trong production flow
- Loading state: hiện skeleton cards trên board khi đang fetch lần đầu
