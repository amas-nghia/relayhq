---
id: task-demo-002
type: task
version: 1
workspace_id: ws-relayhq-demo
project_id: project-relayhq-launch
board_id: board-relayhq-launch
column: in-progress
status: in-progress
priority: critical
title: Record a 30-second product walkthrough
assignee: claude-code
created_by: "@amas"
created_at: 2026-05-05T09:00:00Z
updated_at: 2026-05-05T09:18:00Z
heartbeat_at: 2026-05-05T09:18:00Z
execution_started_at: 2026-05-05T09:05:00Z
execution_notes: Capture the board, open a task, move it to review, and show approval in one take.
progress: 45
next_run_at: null
cron_schedule: null
dispatch_status: started
dispatch_reason: Demo recording session is active.
last_dispatch_attempt_at: 2026-05-05T09:05:00Z
approval_needed: false
approval_requested_by: null
approval_reason: null
approved_by: null
approved_at: null
approval_outcome: pending
blocked_reason: null
blocked_since: null
result: null
completed_at: null
parent_task_id: null
source_issue_id: null
github_issue_id: null
depends_on: [task-demo-001]
tags: [demo, workflow, product]
locked_by: claude-code
locked_at: 2026-05-05T09:05:00Z
lock_expires_at: 2026-05-05T09:35:00Z
links: []
history: []
---

## Objective

Create a concise recording that shows RelayHQ's task lifecycle with minimal context switching.

## Acceptance Criteria

- Starts from the board view
- Opens at least one task detail panel
- Shows a state change during the recording

## Context Files

- web/src/pages/BoardView
