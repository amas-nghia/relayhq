---
id: agent-backend-dev
type: agent
name: Backend Developer
role: backend-developer
provider: claude
model: claude-sonnet-4-6
aliases: ["backend-dev"]
run_mode: manual
capabilities: ["write-api-endpoints", "write-unit-tests", "review-backend-pr"]
task_types_accepted: ["feature-implementation", "bug-fix", "test-writing"]
approval_required_for: ["breaking-api-change", "delete-data", "deploy-to-production"]
cannot_do: ["frontend-design", "billing-logic"]
accessible_by: ["@alice"]
skill_file: skills/relayhq-backend-dev.md
status: available
workspace_id: ws-demo
created_at: 2026-04-15T09:00:00Z
updated_at: 2026-04-15T09:30:00Z
---

# Backend Developer

Default implementation agent for the shared Phase 1 demo workspace.
