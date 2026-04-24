---
id: "workspace-setup-03"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "done"
priority: "medium"
title: "Show vault status indicator in the sidebar"
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
result: "Added useVaultStatus and a compact sidebar chip with loading, valid, and invalid vault states that link to settings."
completed_at: "2026-04-19T00:00:00Z"
parent_task_id: null
depends_on: ["workspace-setup-01"]
tags: ["workspace", "sidebar", "status"]
links: [{"project":"project-relayhq-dev","thread":"thread-workspace-setup"}]
locked_by: null
locked_at: null
lock_expires_at: null
---

# Show vault status indicator in the sidebar

Surface vault connectivity in the app shell without disrupting navigation.
