---
id: "web-06-pm2-cors-config"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "cancelled"
priority: "high"
title: "PM2 config cho web/ + CORS trên Nuxt"
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
depends_on: []
tags: ["web", "pm2", "devops", "ui-migration"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# PM2 config cho web/ + CORS trên Nuxt

Để `web/` React app có thể chạy song song với `app/` Nuxt, cần:
1. Thêm web/ vào `ecosystem.config.cjs`
2. Enable CORS trên Nuxt server cho localhost:3001

## 1. ecosystem.config.cjs

Thêm entry cho web/:

```js
{
  name: 'web',
  script: 'npm',
  args: 'run dev',
  cwd: './web',
  env: {
    PORT: 3001,
    VITE_API_BASE_URL: 'http://localhost:3000'
  }
}
```

## 2. CORS trên Nuxt

Trong `app/nuxt.config.ts`, thêm hoặc cập nhật routeRules:

```ts
routeRules: {
  '/api/**': {
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:3001',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  }
}
```

Hoặc dùng Nuxt server middleware nếu cần linh hoạt hơn.

## 3. web/.env.example

```
VITE_API_BASE_URL=http://localhost:3000
```

## Verification

- `pm2 start ecosystem.config.cjs` → cả `app` (port 3000) và `web` (port 3001) chạy
- `web/` gọi được `GET http://localhost:3000/api/vault/read-model` không bị CORS error
- Kết quả hiện trên board

## Slash commands cần tạo

Sau khi xong, tạo `/pm2-web` command trong `.claude/` để restart web/ process.
