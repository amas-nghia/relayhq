# RelayHQ

RelayHQ is a control plane for agent-assisted work.

It gives teams one place to register projects, assign ownership, request approvals, track progress, and preserve the history behind important decisions.

## Who it is for

RelayHQ is for teams that need accountable coordination across humans and agents, especially when visibility and traceability matter more than raw automation.

It is useful when you need to coordinate:

- humans working with humans
- humans working with agents
- agents handing work back to humans
- multiple projects at once

## What it solves

Teams using agents in real work usually need more than a prompt and a chat window.

They need:

- a stable home for work across multiple projects
- clear handoffs between people and agents
- explicit approval for risky or expensive actions
- progress tracking that survives context loss
- reporting that shows what happened and why
- feedback loops that improve agent behavior over time

RelayHQ exists to provide that coordination layer.

## Product vision

RelayHQ should grow into a workspace for ongoing agent-assisted operations, not just isolated tasks.

Planned capability areas include:

- multi-project workspaces
- plans
- task breakdowns
- chat
- reminders
- progress tracking
- customer reporting
- agent improvement loops

That vision is intentionally broad, but the repository starts with the smallest useful control plane first.

## Phase 1

Phase 1 is the smallest useful version of RelayHQ.

### Included

- project registry
- task board
- human and agent assignment
- approvals
- audit notes

### Not included

- full automation platform
- marketplace for third-party agents
- advanced analytics
- billing

## Human-facing and machine-facing usage

RelayHQ is meant to support both audiences.

### Human-facing

Humans use RelayHQ to:

- create and review projects
- break work into tasks
- assign work to people or agents
- approve important actions
- review progress and history

### Machine-facing

Agents use RelayHQ as the coordination surface for:

- receiving assigned tasks
- reporting status
- requesting approval
- writing audit notes
- feeding back outcomes for future improvement

RelayHQ is not the agent runtime. It is the control plane around it.

## What RelayHQ is

RelayHQ is:

- a project registry
- a task coordination layer
- a human/agent assignment system
- an approval workflow
- an audit trail
- a foundation for incremental orchestration

## What RelayHQ is not

RelayHQ is not:

- a full automation platform
- a marketplace for third-party agents
- an advanced analytics product
- a billing system
- a replacement for the tools that actually do the work

## Current repository state

This repository is currently a scaffold.

That means:

- the product direction is defined
- the scope is intentionally small
- implementation has not started in earnest
- the docs are the source of truth for now

There is no runnable runtime yet.

## Getting started

There is nothing to install or run yet.

```bash
git clone <repo-url>
cd RelayHQ
```

Then read the docs below to understand the direction and scope.

## Development expectations

Because this is still a scaffold:

- keep work within the documented scope
- keep changes small and easy to review
- update docs when scope changes
- avoid building runtime features outside Phase 1

## Repository layout

```text
RelayHQ/
├─ README.md
├─ LICENSE
├─ docs/
│  ├─ index.md
│  ├─ vision.md
│  ├─ architecture.md
│  ├─ roadmap.md
│  ├─ relayhq-scope.md
│  ├─ decision-log.md
│  ├─ scope/
│  │  └─ phase-1.md
│  ├─ domain/
│  │  ├─ glossary.md
│  │  └─ model.md
│  ├─ workflows/
│  │  ├─ project-registry.md
│  │  ├─ task-board.md
│  │  ├─ assignment.md
│  │  ├─ approvals.md
│  │  └─ audit-notes.md
│  ├─ decisions/
│  │  └─ log.md
│  └─ capabilities/
│     ├─ plans.md
│     ├─ chat.md
│     ├─ reminders.md
│     ├─ progress-tracking.md
│     ├─ customer-reporting.md
│     └─ agent-improvement-loops.md
└─ .gitignore
```

## Docs

- `docs/index.md` - documentation hub and reading order
- `docs/vision.md` - product definition and long-term vision
- `docs/scope/phase-1.md` - current Phase 1 scope and non-goals
- `docs/domain/glossary.md` - canonical product vocabulary
- `docs/domain/model.md` - core entities and relationships
- `docs/workflows/*.md` - how the control plane behaves
- `docs/decisions/log.md` - durable decisions and rationale
- `docs/roadmap.md` - phased growth after Phase 1
- `docs/capabilities/*.md` - future capability definitions

## Design principles

RelayHQ should optimize for:

- clarity over cleverness
- traceability over hidden state
- small increments over large rewrites
- usable workflow over abstract architecture
- explicit ownership over implied responsibility
- simple coordination primitives over broad abstraction

## Questions RelayHQ should answer

A good RelayHQ implementation should make these easy to answer:

- What is being worked on right now?
- Who owns this task?
- Why was this approved?
- What did the agent do?
- What changed, and when?
- What needs attention next?

## License

See `LICENSE`.
