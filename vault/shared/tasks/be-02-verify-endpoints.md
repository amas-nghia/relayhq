---
id: "be-02-verify-endpoints"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "todo"
status: "todo"
priority: "high"
title: "Verify tất cả BE endpoints trả đúng shape cho FE"
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
depends_on: ["int-00-contract", "be-01-cors"]
tags: ["be", "verify", "integration"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# Verify tất cả BE endpoints trả đúng shape cho FE

Sau khi contract được định nghĩa, kiểm tra từng endpoint thực tế trả gì và fix nếu không khớp contract.

## Endpoints cần verify

### GET /api/vault/read-model
- Tasks có đủ fields không? (`heartbeatAt`, `approvalReason`, `blockedReason`, `sourcePath`...)
- Agents trả đúng shape không?
- camelCase hay snake_case? FE expect camelCase

### POST /api/vault/tasks
- Nhận `CreateTaskInput` đúng không?
- Trả task vừa tạo với đủ fields không?

### POST /api/vault/tasks/[id]/approve
- Nhận `{ actorId }` không?
- Trả updated task không?

### POST /api/vault/tasks/[id]/reject  
- Nhận `{ actorId, reason? }` không?
- Hiện tại code chỉ nhận `actorId` — cần thêm `reason`

### GET /api/vault/audit-notes
- Trả `AuditNote[]` với `createdAt`, `source`, `message`, `taskId?` không?

### GET /api/health
- Verify endpoint này tồn tại và trả `{ status: 'ok' }`

## Action items

1. Chạy app: `cd app && bun run dev`
2. Dùng curl hoặc browser để gọi từng endpoint
3. So sánh với contract types trong `web/src/api/contract.ts`
4. Fix mismatches trong BE handlers
5. Đặc biệt: snake_case → camelCase conversion nếu cần

## Notes

- `app/server/api/vault/tasks/[id]/reject.ts` hiện chưa nhận `reason` — cần thêm
- Một số fields có thể là `null` thay vì `undefined` — FE cần handle cả hai
- Nếu BE trả snake_case, cần quyết định: convert ở BE hay FE
