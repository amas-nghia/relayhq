# RelayHQ Docs

RelayHQ’s documentation hub.

Use this page to find the source of truth fast.

## Recommended reading order

1. `README.md` - product overview and entry point
2. `docs/index.md` - documentation map and canonical sources
3. `docs/vision.md` - product definition and long-term direction
4. `docs/scope/phase-1.md` - current Phase 1 scope and non-goals
5. `docs/domain/glossary.md` - canonical product vocabulary
6. `docs/domain/model.md` - core entities and relationships
7. `docs/workflows/*.md` - how the control plane behaves
8. `docs/decisions/log.md` - durable decisions and rationale
9. `docs/roadmap.md` - phased growth after Phase 1

## Canonical docs

| Topic | Canonical doc |
|---|---|
| Product overview | `README.md` |
| Product vision | `docs/vision.md` |
| Scope | `docs/scope/phase-1.md` |
| Domain vocabulary | `docs/domain/glossary.md` |
| Domain model | `docs/domain/model.md` |
| Workflows | `docs/workflows/*.md` |
| Decisions | `docs/decisions/log.md` |
| Roadmap | `docs/roadmap.md` |
| Future capabilities | `docs/capabilities/*.md` |
| Architecture boundaries | `docs/architecture.md` |
| Agent execution protocol | `docs/workflows/agent-execution-protocol.md` |
| Run log template | `docs/runs/template.md` |
| Example run log | `docs/runs/2026-04-09-project-registry-slice.md` |

## What each doc is for

### `README.md`

High-level product entry point.

Use it for:

- what RelayHQ is
- who it is for
- what Phase 1 includes
- what RelayHQ is not
- how to orient yourself

### `docs/vision.md`

The product statement.

Use it for:

- the problem RelayHQ solves
- the coordination model
- the human/agent split
- the long-term product vision

### `docs/scope/phase-1.md`

Current release boundary.

Use it for:

- what is in Phase 1
- what is out of scope
- why the scope is small
- what success looks like

### `docs/domain/glossary.md`

Canonical terminology.

Use it for:

- project
- task
- plan
- assignment
- approval
- audit note
- progress snapshot
- report
- thread / chat
- workspace

### `docs/domain/model.md`

The conceptual data model.

Use it for:

- entities and relationships
- what is central now vs later
- how the control plane is structured

### `docs/workflows/*.md`

Behavioral docs.

Use them for:

- how projects are registered
- how tasks move
- how assignment works
- how approvals work
- how audit notes are written and preserved
- how agents are coordinated during execution

### `docs/decisions/log.md`

Durable product decisions.

Use it for:

- decisions that should outlast a task
- rationale for direction changes
- decisions that affect future implementation

### `docs/roadmap.md`

Growth plan.

Use it for:

- what comes after Phase 1
- what should be built next
- how larger capabilities are staged

### `docs/capabilities/*.md`

Future capability definitions.

Use them for:

- plans
- chat
- reminders
- progress tracking
- customer reporting
- agent improvement loops

### `docs/architecture.md`

System boundaries.

Use it for:

- control plane vs runtime
- where state belongs
- what RelayHQ owns and does not own

### `docs/workflows/agent-execution-protocol.md`

Execution protocol for layered agents.

Use it for:

- task intake
- decomposition
- priority and requirements capture
- agent selection
- logging step-by-step progress
- pilot feedback and template updates

### `docs/runs/template.md`

Run log template.

Use it for:

- capturing each execution run
- recording timestamps and durations
- logging difficulty and outcome
- noting follow-up updates

### `docs/runs/*.md`

Example execution logs.

Use them for:

- reviewing how a run was executed
- comparing outcomes across runs
- refining agent instructions and routing rules

## Source of truth rule

- If a topic is about the product story, read `README.md` and `docs/vision.md`.
- If a topic is about Phase 1, read `docs/scope/phase-1.md`.
- If a topic is about terminology, read `docs/domain/glossary.md`.
- If a topic is about decisions, read `docs/decisions/log.md`.
- If a topic is about future scope, read `docs/roadmap.md` or the capability docs.

If docs conflict, the more specific canonical doc wins.

## For agents

- Prefer canonical docs over memory.
- If a change affects vision, scope, or decisions, update the relevant doc first.
- If a new capability is introduced, add a doc for it under `docs/capabilities/`.
