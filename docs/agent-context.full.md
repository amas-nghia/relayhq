# RelayHQ Full Agent Context

This file is the long-form context pack for agents working on RelayHQ.

## 1. What RelayHQ is

RelayHQ is a **Kanban-first control plane** for agent-assisted project work.

It exists to make work:
- visible
- assignable
- reviewable
- auditable
- recoverable after context loss

RelayHQ is **not** the execution engine. It does not run models, prompts, or tools itself.

## 2. Why RelayHQ exists

Teams using agents usually need more than a prompt window.

They need:
- a stable home for work across projects
- a board showing work movement
- clear handoffs between people and agents
- explicit approval for risky actions
- progress tracking that survives context loss
- reporting that shows what happened and why
- feedback loops that improve future work

## 3. RelayHQ boundary

### RelayHQ owns
- work structure
- board state
- ownership and assignment
- approval gates
- audit trail
- coordination rules
- state synchronization from the vault

### Runtime owns
- model selection
- prompt execution
- tool execution
- retries
- token/cost accounting at runtime
- context recovery while executing

### Kioku owns
- long-term semantic memory
- retrieval over facts/entities/relationships
- similarity and pattern search

### Discovery flow
- Use ContextScout for file discovery only.
- Hand off to TaskManager for planning or CoderAgent/TestEngineer/DocWriter for execution.
- Do not extend ContextScout into implementation work.

## 4. The 3-layer architecture

### Layer 1: Domain model
The conceptual hierarchy is:

`Workspace → Project → Board → Column → Task`

Related entities:
- Assignment
- Approval
- Audit Note
- Thread
- Plan
- Progress Snapshot
- Report
- Agent Profile

### Layer 2: Vault-first storage
RelayHQ stores coordination state as **Markdown + YAML frontmatter + Git**.

This gives:
- human readability
- version history
- diffs/merge support
- portable state
- provider neutrality

### Layer 3: API + UI
- Nuxt 3 app/API reads and writes the vault
- Vue frontend displays board/project/task state
- runtime integrations remain external

## 5. Why vault-first

Vault-first means the shared source of truth is files, not a hidden database.

Benefits:
- portable
- auditable
- git-native
- easy to inspect
- provider-agnostic
- can be indexed by tools like Kioku

## 6. Vault layout

Recommended shared structure:

```text
vault/
├─ shared/
│  ├─ workspaces/
│  ├─ projects/
│  ├─ boards/
│  ├─ columns/
│  ├─ issues/
│  ├─ agents/
│  ├─ runs/
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

### Shared vs private
- `shared/` is team-visible and git-tracked
- `users/<user>/` is private overlay data

## 7. Canonical task schema

Tasks are the atomic coordination unit.

Typical task fields:
- `id`
- `type: task`
- `version`
- `workspace_id`
- `project_id`
- `board_id`
- `column`
- `status`
- `priority`
- `title`
- `assignee`
- `created_by`
- `created_at`
- `updated_at`
- `heartbeat_at`
- `execution_started_at`
- `execution_notes`
- `progress`
- `approval_needed`
- `approval_reason`
- `approved_by`
- `approved_at`
- `approval_outcome`
- `blocked_reason`
- `blocked_since`
- `result`
- `completed_at`
- `parent_task_id`
- `depends_on`
- `tags`
- `links`

### Status values
- `todo`
- `in-progress`
- `blocked`
- `waiting-approval`
- `done`
- `cancelled`

### Protocol fields that matter most
- `heartbeat_at` for liveness
- `progress` for partial state
- `approval_needed` for gates
- `blocked_reason` for recovery
- `result` for completion summary

## 8. Conflict handling

If multiple agents might edit the same task, the system needs:
- lock fields
- stale lock expiry
- heartbeat updates
- stale task detection

Suggested lock fields:
- `locked_by`
- `locked_at`
- `lock_expires_at`

## 9. Agent registry

Agents are registry entries, not execution engines.

Suggested built-in roles:
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

### Agent file contents
An agent definition should describe:
- role
- provider default
- model default
- capabilities
- accepted task types
- approval-required actions
- forbidden actions
- access scope
- skill file
- workspace scope
- status

### Access model
Access should be explicit at:
- workspace level
- project level
- agent level

## 10. Agent protocol

Agents must know how to keep RelayHQ current.

### Session start
1. load protocol/skill context
2. query assigned tasks
3. pick a ready task

### Claiming work
When work starts:
- set `status: in-progress`
- set `execution_started_at`
- set `heartbeat_at`

### During work
Update:
- `heartbeat_at`
- `progress`
- `execution_notes`

### Approval flow
If risky:
- set `approval_needed: true`
- set `status: waiting-approval`
- stop and wait

### Completion flow
When done:
- set `status: done`
- set `result`
- set `completed_at`
- append audit note

### Failure flow
If blocked:
- set `status: blocked`
- fill `blocked_reason`
- fill `blocked_since`

## 11. CLI protocol

Agents should interact via CLI or equivalent writeback protocol.

Representative commands:

```bash
relayhq-cli tasks --assignee=me
relayhq-cli update task-001 --status=in-progress
relayhq-cli heartbeat task-001
relayhq-cli request-approval task-001 --reason="Need prod access"
relayhq-cli update task-001 --status=done --result="PR #42 created"
```

### Important rule
Agents are responsible for reporting.
RelayHQ is responsible for coordination, visibility, and audit.

## 12. Dependency enforcement

Task selection should filter out tasks whose dependencies are not done.

The CLI should only return tasks that are:
- assigned to the user/agent
- not cancelled/done
- not dependency-blocked
- not stale-locked by another agent

## 13. Stale detection and recovery

RelayHQ should detect stalled work by heartbeat age.

If `heartbeat_at` is too old:
- mark task stale or needs-recovery
- surface in board UI
- notify responsible human/agent

## 14. Notification and approval visibility

If a task moves to waiting-approval, humans must learn about it.

This may be handled by:
- polling
- webhook/notification hooks
- UI alerts
- inbox/queue views

## 15. Cost and analytics

RelayHQ should eventually track run metadata, but not as the execution engine.

Useful run fields:
- provider
- model
- duration
- tokens_in
- tokens_out
- cost_usd
- result

This supports:
- budget tracking
- agent comparison
- audit and review

## 16. Kioku integration

Kioku is the semantic memory layer.

### What Kioku provides
- BM25 / FTS keyword search
- vector search for similarity
- knowledge graph for entity relationships
- temporal decay for relevance
- no direct LLM calls from Kioku itself

### How RelayHQ and Kioku fit
- RelayHQ stores canonical work state
- Kioku indexes RelayHQ data for fast retrieval
- agents query Kioku first for context
- agents query RelayHQ for authoritative task/project state
- RelayHQ may read Kioku results, but it never treats Kioku as the source of truth
- the Kioku boundary is a real HTTP service contract (`POST /api/search` with `{ query }`)
- if Kioku is unavailable, RelayHQ surfaces a retrieval failure and keeps the vault canonical state unchanged

### Best pattern
- RelayHQ = truth/governance
- Kioku = retrieval/memory
- runtime = execution

## 17. claude-code-agents-ui integration

`claude-code-agents-ui` is a local visual dashboard for Claude Code.

It is useful as:
- a visual runtime/dashboard
- a terminal + chat + graph UI
- a place to inspect agent activity

It is **not** RelayHQ.

RelayHQ should integrate with it as a runtime-facing UI, but the control plane remains RelayHQ.

## 18. Outer Harness concept

Outer Harness is the organizational layer around agents.

It covers:
- process
- data
- governance
- approvals
- auditability
- observability
- quality gates

RelayHQ is the company-level outer harness / control plane.

## 19. Company maturity stages

Observed progression:
1. personal AI use
2. skill/workflow packaging
3. shared context and data
4. credential and governance pain
5. agent brain / one gateway

RelayHQ is designed to move companies toward stage 5.

## 20. Recommended implementation phases

### Phase 1
- core Kanban control plane
- project registry
- board / column flow
- assignment
- approvals
- audit notes

### Phase 2
- plans
- task breakdowns
- parent/child hierarchy
- agent registry + schema
- provider overlay schema

### Phase 3
- read path
- task selection protocol
- `relayhq-cli`
- `relayhq init`
- skill injection

### Phase 4
- write path
- heartbeat
- stale detection
- dependency enforcement
- locking / conflict handling

### Phase 5
- Kioku semantic index integration
- richer search and pattern discovery

## 21. Project setup clarification

RelayHQ vault should be a **separate repo** from application code repos.

It tracks coordination metadata, not the source code itself.

Project code repos remain normal repos; they just link back to RelayHQ work items.

## 22. Security notes

- private overlays must not be committed
- provider keys should be references only
- secrets never belong in shared vault files
- validation should run before commit/push
- pre-commit checks should prevent accidental leaks

## 23. Source docs

Primary docs:
- `README.md`
- `docs/vision.md`
- `docs/architecture.md`
- `docs/vault/structure.md`
- `docs/vault/schema.md`
- `docs/agents/definitions.md`
- `docs/agents/protocol.md`
- `docs/roadmap.md`

Related context:
- `docs/agent-context.md`
- `claude-code-agents-ui/README.md`
- Obsidian clipping on company agent maturity
- Kioku article
- Outer Harness article
