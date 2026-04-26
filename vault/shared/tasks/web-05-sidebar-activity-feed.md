---
id: "web-05-sidebar-activity-feed"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "done"
priority: "medium"
title: "Activity feed trong Sidebar"
assignee: null
created_by: "@amas"
created_at: "2026-04-24T00:00:00Z"
updated_at: "2026-04-26T00:00:00Z"
heartbeat_at: "2026-04-26T00:00:00Z"
execution_started_at: "2026-04-26T00:00:00Z"
execution_notes: "Added a live sidebar activity feed driven by audit logs, with click-through to task detail and an audit view shortcut."
progress: 100
approval_needed: false
approval_requested_by: null
approval_reason: null
approved_by: null
approved_at: null
approval_outcome: "pending"
blocked_reason: null
blocked_since: null
result: "Sidebar now shows the latest five audit events with relative time, icons, and task navigation."
completed_at: "2026-04-26T00:00:00Z"
parent_task_id: null
depends_on: ["web-02-real-data-store"]
tags: ["web", "sidebar", "ui-migration"]
links: []
locked_by: null
locked_at: null
lock_expires_at: null
---

# Activity feed trong Sidebar

Thêm live activity ticker ở phần dưới Sidebar để PM thấy activity gần nhất mà không cần vào Audit page.

## Layout trong Sidebar

```
[existing nav items]
...

─────────────────
LIVE ACTIVITY

🤖 agent-b claimed task-005    2s
✓  @amas approved task-007    1m
🤖 agent-f went stale          10m
─────────────────
```

- Max **5 dòng** gần nhất
- Mỗi dòng: icon + text truncate + relative time
- Click dòng → mở Detail Panel của task liên quan
- "View all →" link → navigate `/audit`

## Animation

- New item: `AnimatePresence` + slide in từ top (150ms)
- Item bị đẩy ra: fade out (100ms)
- Sử dụng Framer Motion (đã có trong dependencies)

## Data source

Derive từ audit notes trong store, hoặc derive từ task state changes:
- Khi tasks array thay đổi sau polling → compute delta → push vào activity feed
- Hoặc đơn giản hơn: lấy 5 audit notes gần nhất từ `GET /api/vault/audit-notes`

## Component

`web/src/components/layout/ActivityFeed.tsx`

Được import và render ở cuối `Sidebar.tsx` (có thể collapsible).

## Notes

- Trên mobile: không hiển thị activity feed trong sidebar (bottom nav không có chỗ)
- Desktop only: render trong sidebar khi đủ chiều cao (> 700px)
