# Task Context: MVP Readiness & Task Manager Hardening

Session ID: 2026-04-14-mvp-readiness-task-manager
Created: 2026-04-14T00:00:00Z
Status: in_progress

## Current Request
Split the task-manager / release-readiness work into atomic tasks that are ready to release for a 1-user MVP. The goal is to make RelayHQ release-ready by tightening the task manager flow, release checks, and Kioku integration boundaries.

## Context Files (Standards to Follow)
- /home/amas/.opencode/context/core/standards/code-quality.md
- /home/amas/.opencode/context/core/standards/documentation.md
- /home/amas/.opencode/context/core/standards/security-patterns.md
- /home/amas/.opencode/context/core/standards/test-coverage.md
- /home/amas/.opencode/context/core/workflows/task-delegation-basics.md

## Reference Files (Source Material)
- /home/amas/Documents/GitHub/RelayHQ-vault-first/README.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/relayhq-build-plan.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/agent-context.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/agent-context.full.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/app/data/task-workflow.ts
- /home/amas/Documents/GitHub/RelayHQ-vault-first/app/data/task-workflow.test.ts
- /home/amas/Documents/GitHub/RelayHQ-vault-first/app/data/relayhq-overview.ts
- /home/amas/Documents/GitHub/RelayHQ-vault-first/.tmp/tasks/vault-persistence-flow/task.json
- /home/amas/Documents/GitHub/RelayHQ-vault-first/.tmp/tasks/relayhq-build/task.json

## Components
- task manager / task manager registry for 1-user MVP
- release readiness checks
- Kioku MVP integration boundary
- UI task workflow + nav/states if needed
- hardening and regression coverage

## Constraints
- 1-user MVP (no team ACL complexity)
- RelayHQ remains control-plane only
- Vault-first remains the source of truth
- Kioku should be real if included in MVP
- Task breakdown must be atomic and dependency-aware

## Exit Criteria
- [ ] Task tree exists with atomic subtasks and dependencies
- [ ] Release-ready MVP scope is explicit
- [ ] First task to start is clear
- [ ] Any affected docs/plan path is identified

## Progress
- [x] Session initialized
- [ ] Tasks created
- [ ] Plan updated
