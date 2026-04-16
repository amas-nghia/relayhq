# RelayHQ Build Plan

RelayHQ is a control plane only; runtime execution stays outside the product.
Vault-first files remain the source of truth.
The implementation stack is Nuxt 3 + Vue 3 + TypeScript + Bun.

## 1-user MVP release slice
- Keep the scope control-plane only.
- Treat the vault as the source of truth for task, agent, and release state.
- Use a minimal single-user agent registry; no team ACL or marketplace work.
- Include Kioku only as a real retrieval boundary, not a mock placeholder.
- Make release verification explicit before anything broader lands.

## Release verification checklist
- [ ] Vault read model reconstructs workspace/project/board/task/approval state.
- [ ] Task-manager flow stays inside the caller/assignee boundary.
- [ ] Single-user agent registry is canonical and visible in docs.
- [ ] Kioku boundary is real and retrieval-only.
- [ ] Secret-bearing and malformed writes are rejected.
- [ ] End-to-end ship path is covered by regression tests.

## Recommended next-task order
1. Publish the MVP release scope and plan update in the vault.
2. Harden the task-manager flow for the single-user control plane.
3. Define the minimal agent registry for the MVP user.
4. Lock the Kioku real-service boundary and integration contract.
5. Add explicit release verification and hardening checks.

## Phases
1. Vault schema foundation
2. Canonical read protocol and read model
3. Write protocol, sync flow, and locking
4. Agent protocol and CLI surface
5. Access control and provider overlays
6. Nuxt app shell, routing, and shared navigation
7. Board and project overview views
8. Task and approval workflow views
9. Kioku indexing and retrieval bridge
10. Hardening and regression coverage

## Parallel batches
- After the schema foundation: read, write, and access-control work can proceed in parallel.
- After read/write/access rules land: CLI, Nuxt shell, board/project views, task/approval views, and Kioku integration can move independently where their dependencies are met.
- Hardening is last.

## Recommended start
Begin with the vault persistence flow breakdown: start with shared contracts, then run the read and write work in parallel.
