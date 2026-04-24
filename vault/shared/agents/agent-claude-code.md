---
id: agent-claude-code
type: agent
name: Claude Code
role: implementation
provider: claude
model: claude-sonnet-4-6
capabilities: ["write-code", "run-tests", "review-code", "write-docs"]
task_types_accepted: ["feature-implementation", "bug-fix", "refactoring", "test-writing", "documentation"]
approval_required_for: ["breaking-api-change", "vault-schema-change", "deploy"]
cannot_do: ["self-approve-breaking-changes", "manage-production-deploys", "store-shared-secrets"]
accessible_by: ["@alice"]
skill_file: skills/claude-code.md
status: available
workspace_id: ws-demo
created_at: 2026-04-16T00:00:00Z
updated_at: 2026-04-16T00:00:00Z
---

# Claude Code

General implementation agent for this repo's dogfooding flow: code changes, focused testing, code review, and documentation updates.
