# Vault Schema

This document defines the canonical file schemas for RelayHQ.

## Common rules
- one object per file
- YAML frontmatter carries machine fields
- Markdown body remains human-readable
- shared files are the source of truth
- private overlays are user-local and must stay out of shared commits
- system files define versioned schema and template assets
- use stable `id` values and explicit timestamps

## Canonical layout

```text
vault/
├─ shared/
│  ├─ workspaces/
│  ├─ projects/
│  ├─ boards/
│  ├─ columns/
│  ├─ tasks/
│  ├─ approvals/
│  ├─ agents/
│  ├─ audit/
│  └─ threads/
├─ users/
│  └─ <user>/
│     ├─ provider.md
│     ├─ prefs.md
│     └─ scratch/
└─ system/
   ├─ schemas/
   └─ templates/
```

### Ownership rules
- `vault/shared/**` is committed coordination state and the canonical team record
- `vault/users/**` is private overlay data and must not be treated as shared truth
- `vault/system/**` contains schema and template assets that define the contract

### Versioning rule
- task frontmatter uses `version: 1` today
- later schema changes should bump the version intentionally and keep migration rules explicit

### Validation helpers
- `validateTaskFrontmatter`
- `validateAgentFrontmatter`
- `validateWorkspaceFrontmatter`
- `validateProviderOverlayFrontmatter`
- `validateAuditNoteFrontmatter`

Each helper returns a validity result with field-level issues. Companion `assert*` helpers can throw a schema error when callers want fail-fast behavior.

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
column: todo
status: todo
priority: high
title: Implement password reset API
assignee: agent-backend-dev
created_by: "@alice"
created_at: 2026-04-14T10:00:00Z
updated_at: 2026-04-14T10:00:00Z

heartbeat_at: null
execution_started_at: null
execution_notes: null
progress: 0

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
depends_on: []
tags: [auth, backend, api]
links:
  - project: project-auth
    thread: thread-001
---
```

### Status values
- todo
- in-progress
- blocked
- waiting-approval
- done
- cancelled

### Column values
- todo
- in-progress
- review
- done

### Recommended execution fields
- `heartbeat_at`
- `execution_started_at`
- `execution_notes`
- `progress`
- `result`
- `completed_at`

### Locking
If concurrent writes are possible, add lock fields:

```yaml
locked_by: agent-backend-dev
locked_at: 2026-04-14T10:00:00Z
lock_expires_at: 2026-04-14T10:05:00Z
```

## Project file

`vault/shared/projects/project-{id}.md`

```yaml
---
id: project-auth
type: project
workspace_id: ws-acme
name: Authentication
codebases:
  - name: frontend
    path: /home/amas/code/auth-frontend
    tech: Next.js
    primary: true
  - name: backend
    path: /home/amas/code/auth-backend
    tech: NestJS
created_at: 2026-04-14T10:00:00Z
updated_at: 2026-04-14T10:00:00Z
---
```

Backward compatibility rule:
- legacy `codebase_root` is still accepted by validators
- when `codebases` is absent and `codebase_root` is present, normalize it to one entry named `main`

Codebase entry rules:
- `name` must be a lowercase slug
- `path` may be absolute or repo-relative
- `tech` is optional
- `primary` is optional

## Agent file

`vault/shared/agents/backend-developer.md`

```yaml
---
id: agent-backend-dev
type: agent
name: Backend Developer
role: implementation
provider: claude
model: claude-sonnet-4-6
capabilities:
  - write-go-code
  - write-python-code
  - write-api-endpoints
  - write-unit-tests
  - review-backend-pr
task_types_accepted:
  - feature-implementation
  - bug-fix
  - api-design
  - refactoring
  - test-writing
approval_required_for:
  - database-schema-change
  - breaking-api-change
  - deploy-to-production
  - delete-data
cannot_do:
  - frontend-code
  - infrastructure-changes
  - billing-logic
accessible_by:
  - "@alice"
  - "@bob"
skill_file: skills/relayhq-backend-dev.md
status: available
workspace_id: ws-acme
created_at: 2026-04-14T10:00:00Z
updated_at: 2026-04-14T10:00:00Z
---
```

## Doc file

`vault/shared/docs/doc-{id}.md`

```yaml
---
id: doc-product-brief
type: doc
doc_type: brief
workspace_id: ws-acme
project_id: project-auth
title: Authentication rollout brief
status: draft
visibility: project
access_roles: [all]
sensitive: false
created_at: 2026-04-14T10:00:00Z
updated_at: 2026-04-14T10:00:00Z
tags: [auth, launch]
---
```

### Supported doc types
- feature
- decision
- research
- runbook
- retro
- brief
- plan
- meeting-minutes
- budget
- expense
- sop
- policy
- adr

### Access control defaults
- `visibility` defaults to `project`
- `access_roles` defaults to `[all]`
- `sensitive` defaults to `false`
- `budget` and `expense` default to `sensitive: true` when scaffolded

### Access control notes
- `visibility` may be `project`, `workspace`, or `private`
- `access_roles` is a flexible string array and can contain agent ids, role markers like `role:pm`, `all`, or `human-only`
- older docs without these fields still load using the defaults above

## Provider overlay file

`vault/users/alice/provider.md`

```yaml
---
type: provider-overlay
user_id: "@alice"
provider: claude
model: claude-sonnet-4-6
api_key_ref: env:ANTHROPIC_API_KEY
routing:
  default_agent: agent-backend-dev
  prefer_agents:
    - agent-backend-dev
    - agent-backend-tester
tool_policy:
  allow_bash: true
  allow_file_write: true
  allow_network: false
preferences:
  language: vi
  response_style: concise
  auto_heartbeat: true
  heartbeat_interval_seconds: 300
updated_at: 2026-04-14T10:00:00Z
---
```

## Workspace file

`vault/shared/workspaces/{workspace_id}.md`

Suggested fields:
- `id`
- `type: workspace`
- `name`
- `owner_ids`
- `member_ids`
- `created_at`
- `updated_at`

## Audit note file

Suggested fields:
- `id`
- `type: audit-note`
- `task_id`
- `message`
- `source`
- `confidence`
- `created_at`

## Validation rules
- required fields must be present
- enums must be valid
- references must resolve where possible
- private overlays must not be committed to shared Git
- task status transitions must follow protocol
