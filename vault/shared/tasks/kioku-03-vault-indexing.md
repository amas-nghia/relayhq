---
id: "kioku-03-vault-indexing"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "done"
priority: "high"
title: "Wire vault indexing and sync from the RelayHQ read model"
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
result: "Wired sanitized read-model indexing into Kioku sync with idempotent upserts and stale-document deletion reconciliation."
completed_at: "2026-04-19T00:00:00Z"
parent_task_id: null
depends_on: ["kioku-01-http-contract","kioku-02-sqlite-storage"]
tags: ["kioku","dogfooding","indexing"]
links: [{"project":"project-relayhq-dev","thread":"thread-kioku-workstream"}]
locked_by: null
locked_at: null
lock_expires_at: null
---

# Wire vault indexing and sync from the RelayHQ read model

Sync canonical RelayHQ read-model entities into Kioku storage through a deterministic indexing pipeline.
