---
id: "kioku-04-retrieval-api"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "done"
priority: "high"
title: "Wire retrieval API and the canonical-resolution integration contract"
assignee: "agent-claude-code"
created_by: "@alice"
created_at: "2026-04-16T00:00:00Z"
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
result: "Added POST /api/kioku/search with query validation, on-demand sync, sanitized response payloads, and local self-hosted retrieval support."
completed_at: "2026-04-19T00:00:00Z"
parent_task_id: null
depends_on: ["kioku-01-http-contract","kioku-02-sqlite-storage","kioku-03-vault-indexing"]
tags: ["kioku","dogfooding","retrieval-api"]
links: [{"project":"project-relayhq-dev","thread":"thread-kioku-workstream"}]
locked_by: null
locked_at: null
lock_expires_at: null
---

# Wire retrieval API and the canonical-resolution integration contract

Expose Kioku-backed retrieval in a way that resolves hits back to canonical RelayHQ entities and keeps vault state authoritative.
