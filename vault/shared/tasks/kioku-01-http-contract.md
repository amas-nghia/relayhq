---
id: "kioku-01-http-contract"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "done"
priority: "high"
title: "Lock the Kioku HTTP search contract and failure semantics"
assignee: "agent-claude-code"
created_by: "@alice"
created_at: "2026-04-16T00:00:00Z"
updated_at: "2026-04-19T00:00:00Z"
heartbeat_at: "2026-04-16T06:09:59.806Z"
execution_started_at: "2026-04-16T06:09:37.309Z"
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
result: "Locked the Kioku HTTP client contract, added local search-path support, and preserved typed failure semantics without fallback results."
completed_at: "2026-04-19T00:00:00Z"
parent_task_id: null
depends_on: []
tags: ["kioku","dogfooding","http-contract"]
links: [{"project":"project-relayhq-dev","thread":"thread-kioku-workstream"}]
locked_by: "agent-claude-code"
locked_at: "2026-04-16T06:09:37.309Z"
lock_expires_at: "2026-04-16T06:14:37.309Z"
---

# Lock the Kioku HTTP search contract and failure semantics

Define the Kioku retrieval boundary so RelayHQ can depend on a strict HTTP search contract without inventing fallback results.
