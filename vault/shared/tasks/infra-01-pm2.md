---
id: "infra-01-pm2"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "todo"
status: "todo"
priority: "high"
title: "PM2 config: chạy api + web độc lập"
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
depends_on: ["be-01-cors"]
tags: ["infra", "pm2", "devops"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# PM2 config: chạy api + web độc lập

Cập nhật `ecosystem.config.cjs` để chạy `app/` (BE) và `web/` (FE) như 2 processes độc lập. Một cái crash không ảnh hưởng cái kia.

## ecosystem.config.cjs

```js
module.exports = {
  apps: [
    {
      name: 'api',
      script: 'bun',
      args: 'run dev',
      cwd: './app',
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      env: {
        PORT: 3000,
        NODE_ENV: 'development',
        CORS_ORIGIN: 'http://localhost:3001'
      }
    },
    {
      name: 'web',
      script: 'npm',
      args: 'run dev',
      cwd: './web',
      max_restarts: 10,
      restart_delay: 1000,
      watch: false,
      env: {
        VITE_API_BASE_URL: 'http://localhost:3000'
      }
    }
  ]
}
```

## web/.env.example

```
VITE_API_BASE_URL=http://localhost:3000
```

## Slash commands cần tạo/update

Trong `.claude/` tạo hoặc update:
- `/pm2-all` → `pm2 start ecosystem.config.cjs`
- `/pm2-api` → restart chỉ api process
- `/pm2-web` → restart chỉ web process
- `/pm2-logs` → `pm2 logs --lines 50`

## Verify

```bash
pm2 start ecosystem.config.cjs
pm2 list
# Expect: api (online, port 3000), web (online, port 3001)

# Kill web, verify api still alive
pm2 stop web
curl http://localhost:3000/api/health  # still works

pm2 start web
# web recovers independently
```
