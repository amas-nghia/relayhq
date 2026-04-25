---
id: "web-07-world-canvas-real-data"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "done"
priority: "medium"
title: "WorldCanvas: dùng real data từ store thay vì mock"
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
result: "WorldCanvas now reads live projects, agents, and tasks from the store and renders stale agents in place."
completed_at: "2026-04-25T00:00:00Z"
parent_task_id: null
depends_on: ["web-02-real-data-store"]
tags: ["web", "canvas", "pixi", "ui-migration"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# WorldCanvas: dùng real data từ store thay vì mock

`WorldCanvas.tsx` hiện đang hardcode `mockAgents` và `mockProjects` để build rooms và desks. Cần lấy từ Zustand store để canvas phản ánh vault state thực.

## Thay đổi trong WorldCanvas.tsx

### 1. Lấy data từ store trong useEffect

```ts
// Hiện tại:
mockAgents.forEach(...)
mockProjects.forEach(...)

// Thay bằng:
const agents = useAppStore.getState().agents
const projects = useAppStore.getState().projects
const tasks = useAppStore.getState().tasks
```

### 2. Phòng (rooms) dynamic theo projects thực

- Tạo room cho mỗi project trong store
- Nếu nhiều hơn 4 projects: layout dạng grid 2 cột, scroll canvas

### 3. Desks dynamic theo agents thực

- Mỗi agent trong store có một desk trong "Agent Work Area"
- Agent state → desk color:
  - `active` → blue stroke
  - `waiting` → amber stroke
  - `stale` → red stroke, greyscale avatar
  - `idle` → grey stroke, no avatar pulse

### 4. Ticker vẫn subscribe từ store

```ts
app.ticker.add(() => {
  const { tasks, agents } = useAppStore.getState()
  // sync sprites từ live store state
})
```

### 5. Stale agent visual

Khi agent state === 'stale':
- Avatar circle: greyscale (filter hoặc tint 0x808080)
- Không có pulse animation
- Không di chuyển về phía task (agent stuck at desk)

## Notes

- Canvas rooms và desks được build một lần khi Pixi init
- Nếu projects/agents thay đổi (polling update), cần re-init canvas — có thể dùng useEffect dependency
- Hoặc đơn giản: rebuild rooms khi data thay đổi (destroy + reinit Pixi)
