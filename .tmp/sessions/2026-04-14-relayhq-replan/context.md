# Task Context: Replan RelayHQ Work Breakdown

Session ID: 2026-04-14-relayhq-replan
Created: 2026-04-14T00:00:00Z
Status: in_progress

## Current Request
Re-split the RelayHQ work into atomic subtasks after the tech stack change. Update the vault-facing plan and the task tree so the work matches a Nuxt 3 + Vue 3 + TypeScript + Bun stack.

## Context Files (Standards to Follow)
- /home/amas/.opencode/context/core/standards/code-quality.md
- /home/amas/.opencode/context/core/standards/documentation.md
- /home/amas/.opencode/context/core/standards/security-patterns.md
- /home/amas/.opencode/context/core/standards/test-coverage.md
- /home/amas/.opencode/context/core/workflows/task-delegation-basics.md

## Reference Files (Source Material)
- /home/amas/Documents/GitHub/RelayHQ-vault-first/README.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/index.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/vision.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/architecture.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/roadmap.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/relayhq-build-plan.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/agent-context.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/agent-context.full.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/vault/structure.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/vault/schema.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/agents/definitions.md
- /home/amas/Documents/GitHub/RelayHQ-vault-first/docs/agents/protocol.md

## Components
- Vault schema foundation
- Vault read/write protocol
- Agent protocol + CLI
- Access control and provider overlays
- Nuxt app shell + routing + layout
- Board/project/task/approval UI
- Kioku indexing/search integration
- Hardening, locking, validation, tests

## Constraints
- RelayHQ remains a control plane only.
- The app stack is Nuxt 3 + Vue 3 + TypeScript + Bun.
- The vault is the source of truth.
- Tasks must be atomic and dependency-aware.
- Mark parallelizable work clearly.

## Exit Criteria
- [ ] Updated task tree exists for the new stack
- [ ] Parallel batches are explicit
- [ ] First actionable task is clear
- [ ] Vault-facing plan doc matches the new split

## Progress
- [x] Session initialized
- [ ] Tasks updated
- [ ] Vault plan updated
