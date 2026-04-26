---
id: "web-08-deprecate-nuxt-pages"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "done"
priority: "low"
title: "Deprecate Nuxt UI pages sau khi web/ verified"
assignee: null
created_by: "@amas"
created_at: "2026-04-24T00:00:00Z"
updated_at: "2026-04-26T00:00:00Z"
heartbeat_at: "2026-04-26T00:00:00Z"
execution_started_at: "2026-04-26T00:00:00Z"
execution_notes: "The Nuxt UI pages are already absent; the app is effectively API-only with the React web UI as the active surface."
progress: 100
approval_needed: true
approval_requested_by: null
approval_reason: "Xóa các pages cũ — không thể undo dễ dàng nếu web/ chưa hoàn thiện"
approved_by: "@amas"
approved_at: "2026-04-26T00:00:00Z"
approval_outcome: "approved"
blocked_reason: null
blocked_since: null
result: "Nuxt UI pages are no longer present, leaving the Nuxt app as the backend/API layer while web/ serves the user-facing UI."
completed_at: "2026-04-26T00:00:00Z"
parent_task_id: null
depends_on: ["web-02-real-data-store", "web-03-task-mutations-api", "web-06-pm2-cors-config"]
tags: ["web", "cleanup", "nuxt", "ui-migration"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# Deprecate Nuxt UI pages sau khi web/ verified

Sau khi `web/` React app đã được verify hoạt động với real data, xóa hoặc disable các Nuxt Vue pages cũ trong `app/pages/`.

## Điều kiện trước khi làm task này

- [ ] web-02 done: store dùng real data, polling hoạt động
- [ ] web-03 done: create/approve/reject mutations đã wire
- [ ] web-06 done: PM2 chạy web/ ổn định
- [ ] Manual test: tất cả flows hoạt động trên web/ (board, tasks, approvals, agents, audit)

## Nuxt pages cần xóa/disable

```
app/pages/index.vue               → replace bằng redirect sang web/
app/pages/boards/[board].vue
app/pages/tasks/index.vue
app/pages/tasks/[id].vue
app/pages/approvals/index.vue
app/pages/agents/index.vue
app/pages/audit/index.vue
app/pages/projects/[id].vue
app/components/boards/
app/components/tasks/
app/components/approvals/
app/components/navigation/
app/components/projects/
app/components/EmptyState.vue
```

## Giữ lại

```
app/server/           → KHÔNG xóa, đây là backend API layer
app/shared/vault/     → KHÔNG xóa, shared schema types
app/layouts/          → Có thể giữ minimal layout
```

## Strategy

Option A (recommended): Giữ Nuxt app làm **API-only server**, xóa tất cả pages
- `nuxt.config.ts`: set `ssr: false` hoặc chỉ giữ server routes
- Xóa tất cả pages/, components/ không còn dùng

Option B: Giữ nguyên Nuxt pages (unused), chỉ không route đến

## Notes

- Cần approval trước khi làm — task này đánh dấu `approval_needed: true`
- Backup: git branch `backup/nuxt-ui` trước khi xóa
