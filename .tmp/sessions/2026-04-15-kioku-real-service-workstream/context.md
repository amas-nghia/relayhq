# Task Context: Kioku Real Service Workstream

Session ID: 2026-04-15-kioku-real-service-workstream
Created: 2026-04-15T00:00:00Z
Status: in_progress

## Current Request
Break the Kioku real-service workstream into TaskManager subtasks. The goal is to turn Kioku into a real retrieval boundary for RelayHQ: HTTP search contract, SQLite-backed storage, vault indexing, integration wiring, and regression tests.

## Context Files (Standards to Follow)
- /home/amas/.opencode/context/core/workflows/task-delegation-basics.md
- /home/amas/.opencode/context/core/standards/code-quality.md
- /home/amas/.opencode/context/core/standards/security-patterns.md
- /home/amas/.opencode/context/core/standards/test-coverage.md
- /home/amas/.opencode/context/core/standards/documentation.md

## Reference Files (Source Material)
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/architecture.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/agent-context.full.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/relayhq-build-plan.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/agents/protocol.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/agent-context.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/roadmap.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/README.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/.tmp/tasks/mvp-readiness-task-manager/task.json
- /home/amas/Documents/GitHub/RelayHQ-vault-first/.tmp/tasks/mvp-readiness-task-manager/subtask_04.json
- /home/amas/Documents/GitHub/RelayHQ-vault-first/.tmp/tasks/relayhq-build/task.json
- /home/amas/Documents/GitHub/RelayHQ-vault-first/.tmp/tasks/relayhq-build/subtask_09.json

## Constraints
- RelayHQ remains control-plane only.
- Kioku is retrieval-only and must not become authoritative state.
- Vault files remain the source of truth.
- Follow single-user MVP scope; do not introduce team ACLs or marketplace features.
- Keep secrets out of persisted files and task outputs.
- Prefer small, dependency-aware subtasks that can be executed independently where possible.

## Acceptance Criteria
- TaskManager returns a clear JSON task tree for the Kioku workstream.
- Subtasks cover contract, storage, indexing, integration, and tests.
- Dependencies are explicit and parallelizable work is marked.
- If something is missing, TaskManager reports missing information instead of guessing.

## Progress
- [x] Session initialized
- [ ] TaskManager breakdown created
- [ ] Review task tree
- [ ] Delegate implementation subtasks
