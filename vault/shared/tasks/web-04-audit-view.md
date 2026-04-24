---
id: "web-04-audit-view"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "todo"
status: "todo"
priority: "medium"
title: "AuditView: kết nối real API + timeline"
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
depends_on: ["web-01-api-client"]
tags: ["web", "audit", "ui-migration"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# AuditView: kết nối real API + timeline

`AuditView.tsx` cần fetch từ `GET /api/vault/audit-notes` thay vì mock data, và render timeline theo spec.

## Việc cần làm

### 1. Fetch audit notes

```ts
// Trong AuditView hoặc store
const [auditNotes, setAuditNotes] = useState<AuditNote[]>([])
useEffect(() => {
  api.getAuditNotes().then(setAuditNotes)
}, [])
```

### 2. Timeline layout

Group notes theo ngày (TODAY, YESTERDAY, date string):

```
TODAY
  14:32  🤖 agent-backend requested approval for task-007
  13:45  ✓ @amas approved task-005
  12:00  🤖 agent-backend claimed task-005

YESTERDAY
  16:20  @amas created task-012
  15:00  🤖 agent-backend completed task-009
```

### 3. Icon per action type

- `claimed` → Bot icon (blue)
- `approved` → Check icon (green)
- `rejected` → X icon (red)
- `completed` → Check circle (green)
- `created` → Plus icon (slate)
- `blocked` → AlertTriangle (red)
- `requested-approval` → Clock icon (amber)

### 4. Link task

Mỗi audit note có `taskId` — click → mở Detail Panel của task đó.

### 5. Filter

Filter by project (dropdown) — optional, nice to have.

## AuditNote type

```ts
interface AuditNote {
  id: string
  message: string
  source: string          // agent-xxx hoặc @username
  created_at: string      // ISO string
  task_id?: string
  source_path: string     // vault path
}
```

## Notes

- Vault audit files: `vault/shared/audit/*.md`
- API đã có: `GET /api/vault/audit-notes`
- Nếu API chưa trả đúng format, cần kiểm tra `app/server/api/vault/audit-notes.get.ts`
