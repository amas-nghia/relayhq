---
id: "workspace-setup-01"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "done"
priority: "high"
title: "Add settings API endpoints for vault inspection and validation"
assignee: "agent-claude-code"
created_by: "@alice"
created_at: "2026-04-19T00:00:00Z"
updated_at: "2026-04-19T00:00:00Z"
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
result: "Added GET /api/settings, POST /api/settings/validate, and immediate-apply settings writes with targeted API tests."
completed_at: "2026-04-19T00:00:00Z"
parent_task_id: null
depends_on: []
tags: ["workspace", "settings", "api"]
links: [{"project":"project-relayhq-dev","thread":"thread-workspace-setup"}]
locked_by: null
locked_at: null
lock_expires_at: null
---

# Add settings API endpoints for vault inspection and validation

Expose the configured vault root, validate candidate roots, and apply valid changes without a restart.
