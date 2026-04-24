---
id: "be-01-cors"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "todo"
status: "todo"
priority: "critical"
title: "Enable CORS trên Nuxt API cho web/ origin"
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
tags: ["be", "cors", "critical-path"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# Enable CORS trên Nuxt API cho web/ origin

Quick task. Nuxt hiện chưa có CORS headers — `web/` (port 3001) gọi `app/` (port 3000) sẽ bị browser block.

## Fix

Trong `app/nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],

  routeRules: {
    '/api/**': {
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:3001',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      }
    }
  }
})
```

## Verify

```bash
curl -H "Origin: http://localhost:3001" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     http://localhost:3000/api/vault/read-model -v
# Expect: Access-Control-Allow-Origin: http://localhost:3001
```

## Notes

- `CORS_ORIGIN` env var để linh hoạt khi deploy
- Production: set đúng domain thay vì localhost
- Không dùng `*` — explicit origin an toàn hơn
