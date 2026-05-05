# Vault Schema

Every RelayHQ object is one Markdown file with YAML frontmatter. The frontmatter is machine-readable; the body is human-readable.

The canonical schema is defined in `backend/internal/vault/schema.go` (Go) and `app/shared/vault/schema.ts` (TypeScript). This document is the human-readable reference.

## Task file

`vault/shared/tasks/task-{id}.md`

```yaml
---
id: task-001
type: task
version: 1
workspace_id: ws-acme
project_id: project-auth
board_id: board-auth-main

# Board position
column: todo                    # todo | in-progress | review | done
status: todo                    # see Status values below
priority: high                  # critical | high | medium | low

title: Implement password reset API
assignee: agent-backend-dev     # agent ID or "unassigned"
created_by: "@alice"
created_at: 2026-04-14T10:00:00Z
updated_at: 2026-04-14T10:00:00Z

# Execution tracking
heartbeat_at: null
execution_started_at: null
execution_notes: null
progress: 0                     # 0–100

# Scheduling
next_run_at: null               # ISO timestamp — when set, task is scheduled
cron_schedule: null             # cron expression for recurring tasks

# Dispatch
dispatch_status: idle           # idle | ready | started | blocked
dispatch_reason: null
last_dispatch_attempt_at: null

# Approval
approval_needed: false
approval_requested_by: null
approval_reason: null
approved_by: null
approved_at: null
approval_outcome: pending       # pending | approved | rejected

# Blocking
blocked_reason: null
blocked_since: null

# Completion
result: null
completed_at: null

# Relationships
parent_task_id: null
source_issue_id: null
github_issue_id: null
depends_on: []                  # list of task IDs this task waits for

# Routing — REQUIRED for auto-dispatch
tags: [auth, backend, api]      # must match agent task_types_accepted or capabilities

# Locking (optimistic concurrency)
locked_by: null
locked_at: null
lock_expires_at: null

links: []
history: []
---

## Objective

What needs to be done and why.

## Acceptance Criteria

- Criterion one
- Criterion two

## Context Files

- path/to/relevant/file.ts
```

### Status values

| Status | Meaning |
|--------|---------|
| `todo` | Ready to be picked up |
| `scheduled` | Waiting for `next_run_at` |
| `in-progress` | Claimed and being worked on |
| `blocked` | Cannot continue, waiting on something external |
| `review` | Work done, waiting for human verification |
| `waiting-approval` | Agent paused, waiting for explicit human sign-off |
| `done` | Human verified and closed |
| `cancelled` | Will not be done |

### Tags — required

Tasks must have at least one tag for the auto-dispatcher to route them. Tags are matched against agent `task_types_accepted` and `capabilities`.

```yaml
tags: [bug-fix, frontend]
```

## Agent file

`vault/shared/agents/agent-{id}.md`

```yaml
---
id: agent-backend-dev
type: agent
name: Backend Developer
role: worker                    # worker | coordinator
provider: anthropic             # anthropic | openai | google | openrouter
model: claude-sonnet-4-6
capabilities:
  - write-go-code
  - write-api-endpoints
task_types_accepted:
  - feature-implementation
  - bug-fix
approval_required_for:
  - database-schema-change
cannot_do:
  - frontend-code
accessible_by: []
skill_file: null
status: available               # available | paused | offline
workspace_id: ws-acme
api_key_ref: env:ANTHROPIC_API_KEY   # env: | secret: | vault: prefix required
created_at: 2026-04-14T10:00:00Z
updated_at: 2026-04-14T10:00:00Z
---
```

## Project file

`vault/shared/projects/project-{id}.md`

```yaml
---
id: project-auth
type: project
workspace_id: ws-acme
name: Authentication
description: Core auth and account lifecycle workstream
status: active                  # active | paused | done
created_at: 2026-04-14T10:00:00Z
updated_at: 2026-04-14T10:00:00Z
---
```

Optional fields: `budget`, `deadline`, `links`, `attachments`, `codebases`.

## Board and column files

`vault/shared/boards/board-{id}.md`

```yaml
---
id: board-auth-main
type: board
workspace_id: ws-acme
project_id: project-auth
name: Auth Board
created_at: 2026-04-14T10:00:00Z
updated_at: 2026-04-14T10:00:00Z
---
```

`vault/shared/columns/col-{id}.md`

```yaml
---
id: col-todo
type: column
workspace_id: ws-acme
project_id: project-auth
board_id: board-auth-main
name: To Do
position: 0
created_at: 2026-04-14T10:00:00Z
updated_at: 2026-04-14T10:00:00Z
---
```

## Coordinator thread file

`vault/shared/coordinator-threads/coordinator-thread-{project_id}.md`

One per project. Anchors the coordinator agent's session identity.

```yaml
---
id: coordinator-thread-project-auth
type: coordinator-thread
workspace_id: ws-acme
project_id: project-auth
coordinator_agent_id: agent-coordinator
active_session_id: null
status: active
created_at: 2026-04-14T10:00:00Z
updated_at: 2026-04-14T10:00:00Z
---
```

## Workspace file

`vault/shared/workspaces/ws-{id}.md`

```yaml
---
id: ws-acme
type: workspace
name: Acme Corp
owner_ids: ["@alice"]
member_ids: ["@alice", "@bob"]
created_at: 2026-04-14T10:00:00Z
updated_at: 2026-04-14T10:00:00Z
---
```

## Audit note file

`vault/shared/audit/audit-{id}.md`

Written automatically on every state change. Do not write these manually.

```yaml
---
id: audit-001
type: audit-note
task_id: task-001
message: Status changed from todo to in-progress
source: agent-backend-dev
created_at: 2026-04-14T10:00:00Z
---
```

## Session event files

`vault/shared/threads/agent-session-{session_id}.jsonl`

One JSON line per event from an agent's stdout. Written by the launch pipeline. Do not write these manually.
