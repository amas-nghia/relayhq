---
id: "vault-init-01"
type: "task"
version: 1
workspace_id: "ws-demo"
project_id: "project-relayhq-dev"
board_id: "board-dev-sprint"
column: "done"
status: "done"
priority: "high"
title: "Build the vault scaffold generator service"
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
result: "Added cli/scaffold.ts with portable vault/shared scaffolding, slugified ids, already-exists protection, and scaffold tests."
completed_at: "2026-04-19T00:00:00Z"
parent_task_id: null
depends_on: []
tags: ["vault", "init", "scaffold"]
links: [{"project":"project-relayhq-dev","thread":"thread-vault-init"}]
locked_by: null
locked_at: null
lock_expires_at: null
---

# Build the vault scaffold generator service

Create the reusable generator that can scaffold a new RelayHQ-compatible vault anywhere.
