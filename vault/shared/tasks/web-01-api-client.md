---
id: "web-01-api-client"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "done"
priority: "critical"
title: "API client layer cho web/"
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
result: "Added the typed web API client layer for read, audit, task mutation, and supporting endpoints."
completed_at: "2026-04-25T00:00:00Z"
parent_task_id: null
depends_on: ["int-00-contract", "be-01-cors", "infra-01-pm2"]
tags: ["web", "api", "ui-migration"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# API client layer cho web/

Tạo `web/src/api/client.ts` — typed fetch module kết nối web/ React app với Nuxt server APIs hiện có tại `app/server/api/`.

## Scope

Tạo một API client module tập trung, typed, không rải fetch khắp components.

## Endpoints cần wrap

```ts
// Read
GET  /api/vault/read-model          → ReadModel (tasks, agents, projects, boards)
GET  /api/vault/audit-notes         → AuditNote[]

// Task mutations
POST   /api/vault/tasks             → Task (create)
PATCH  /api/vault/tasks/[id]        → Task (update)
POST   /api/vault/tasks/[id]/approve
POST   /api/vault/tasks/[id]/reject
POST   /api/vault/tasks/[id]/claim
POST   /api/vault/tasks/[id]/heartbeat
POST   /api/vault/tasks/[id]/request-approval
```

## Deliverables

- `web/src/api/client.ts` — typed functions cho mỗi endpoint
- `web/src/api/types.ts` — API response types (map từ `app/server/models/read-model.ts`)
- Base URL lấy từ `VITE_API_BASE_URL` (env var), fallback `http://localhost:3000`
- Error handling chuẩn: throw với typed error message

## Notes

- Không dùng axios, dùng native fetch + TypeScript
- Nuxt app chạy trên port 3000, web/ sẽ chạy trên port 3001
- CORS cần được enable trên Nuxt server cho localhost:3001
