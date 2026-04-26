# Agent Definitions

RelayHQ treats agents as registry entries, not as execution engines.

## Purpose
- define what each agent can do
- match tasks to capabilities
- enforce approval boundaries
- make access control explicit

## MVP scope
- This registry is for a single-user MVP only.
- It is the canonical agent entry point for the MVP.

## Base schema

```yaml
---
id: agent-backend-dev
type: agent
name: Backend Developer
role: implementation
provider: claude
model: claude-sonnet-4-6
fallback_models:
  - claude-haiku-4-5
  - gpt-4o-mini
capabilities:
  - write-go-code
  - write-api-endpoints
  - write-unit-tests
task_types_accepted:
  - feature-implementation
  - bug-fix
  - api-design
approval_required_for:
  - database-schema-change
  - breaking-api-change
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

## Recommended built-in roles
- orchestrator
- planner
- task-manager
- researcher
- doc-writer
- frontend-designer
- frontend-developer
- backend-developer
- frontend-tester
- backend-tester

## Skill hierarchy
- `relayhq-base.md`
- `relayhq-planner.md`
- `relayhq-tester.md`
- `relayhq-backend-dev.md`
- `relayhq-frontend-dev.md`

## Access rules
- agent access is workspace-aware in the docs, but the MVP assumes one user and no team ACL complexity
- approval-required actions must be explicit in the registry
- accepted task types and capability boundaries must be listed per agent
- provider defaults can be overridden per user in private overlay files

## Approval-required actions
- database-schema-change
- breaking-api-change
- deploy-to-production
- delete-data

## Accepted task types
- feature-implementation
- bug-fix
- api-design
- refactoring
- test-writing

## Capability boundaries
- backend agents should not take frontend-only work
- frontend agents should not take backend-only work
- tester agents should not claim implementation-only tasks

## Fallback models
- `fallback_models` is optional
- use it to declare ordered backup models when the primary model is rate-limited
- RelayHQ should try these in order before deferring the task for later

## Operational rule
RelayHQ can assign and track agents, but the runtime is responsible for actually running them.
