---
id: task-002
type: task
version: 1
workspace_id: ws-demo
project_id: project-demo
board_id: board-demo
column: done
status: done
priority: critical
title: Expose task lifecycle write APIs
assignee: agent-backend-dev
created_by: "@alice"
created_at: 2026-04-15T09:00:00Z
updated_at: 2026-04-27T00:00:00Z
heartbeat_at: 2026-04-27T00:00:00Z
execution_started_at: 2026-04-15T09:05:00Z
execution_notes: "PATCH, claim, heartbeat, request approval, approve, and reject task lifecycle endpoints are wired through the vault write flow."
progress: 100
approval_needed: false
approval_requested_by: null
approval_reason: null
approved_by: null
approved_at: null
outcome: pending
approval_outcome: pending
blocked_reason: null
blocked_since: null
result: "Task lifecycle write APIs are live and covered by regression tests."
completed_at: 2026-04-27T00:00:00Z
parent_task_id: null
depends_on: ["task-001"]
tags: ["phase-1", "api", "write-flow"]
links: [{"project":"project-demo","thread":"thread-phase-1"}]
locked_by: "agent-backend-dev"
locked_at: 2026-04-15T09:05:00Z
lock_expires_at: 2026-04-15T09:35:00Z
---

# Expose task lifecycle write APIs

Wire the task lifecycle routes so the UI can claim, heartbeat, and request approval.
