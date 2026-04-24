# Task Context: Phase 1 Release Plan

Session ID: 2026-04-15-phase-1-release-plan
Created: 2026-04-15T00:00:00Z
Status: in_progress

## Current Request
Read `docs/phase-1-checklist.md` and the UI design doc, then update the task list through TaskManager.

Note: the repository does not contain `docs/ui-design.md`; the matching source document is `docs/ux-design.md`, which covers the UI design system and UX recommendations.

## Context Files (Standards to Follow)
- /home/amas/.opencode/context/core/workflows/task-delegation-basics.md
- /home/amas/.opencode/context/core/standards/code-quality.md
- /home/amas/.opencode/context/core/standards/security-patterns.md
- /home/amas/.opencode/context/core/standards/test-coverage.md
- /home/amas/.opencode/context/core/standards/documentation.md

## Reference Files (Source Material)
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/phase-1-checklist.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/ux-design.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/architecture.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/agent-context.full.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/relayhq-build-plan.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/agents/protocol.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/README.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/.tmp/tasks/mvp-readiness-task-manager/task.json
- /home/amas/Documents/GitHub/RelayHQ-vault-first/.tmp/tasks/mvp-readiness-task-manager/subtask_04.json
- /home/amas/Documents/GitHub/RelayHQ-vault-first/.tmp/tasks/relayhq-build/task.json
- /home/amas/Documents/GitHub/RelayHQ-vault-first/.tmp/tasks/kioku-real-service-workstream/task.json

## Constraints
- Preserve RelayHQ as a vault-first control plane.
- Keep work in Phase 1 scope only.
- Prioritize blockers before demo UX, then Phase 1 scope, then hardening.
- Use the UX design document for navigation, empty states, approval actions, stale indicators, and responsive layout.
- Keep task breakdown atomic and dependency-aware.

## Desired Task Ordering
1. Blockers that prevent the app from working with real vault data.
2. UI fixes needed before demo.
3. Remaining Phase 1 scope features.
4. Hardening and release verification.

## Acceptance Criteria
- TaskManager produces an updated task tree that maps the checklist into implementation-ready subtasks.
- Each subtask has a clear title, dependency set, and recommended agent.
- Work that can proceed in parallel is marked as such.
- The task tree should reflect the UX doc's component gaps and navigation flows.

## Progress
- [x] Session initialized
- [ ] TaskManager breakdown created
- [ ] Review task tree
- [ ] Delegate implementation subtasks
