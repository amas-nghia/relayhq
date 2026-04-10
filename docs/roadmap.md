# Roadmap

## Implementation model

RelayHQ should grow as one app with clear domain modules.

The roadmap below groups those modules by phase so the product can stay small, understandable, and testable while still growing in capability.

## Phase 1: Core Kanban control plane

- project registry
- task board
- board structure and column flow
- human and agent assignment
- approvals
- audit notes

### Phase 1 modules

- workspace / tenant boundary
- identity and access basics
- project registry
- board service
- column / workflow model
- task board
- assignment
- approvals
- audit trail

**Goal:** coordinate work through visible boards with clear ownership and traceability.

## Phase 2: Plans and deeper task structure

- structured plans
- task breakdowns
- parent/child work organization

### Phase 2 modules

- plan service
- task hierarchy / breakdown support
- dependency modeling

**Goal:** move from board cards to explicit execution plans when the work needs more structure.

## Phase 3: Chat

- coordination threads
- work-specific discussion
- handoff context in one place

### Phase 3 modules

- thread / chat service
- conversation-to-work linkage
- message context preservation

**Goal:** reduce coordination scattered across tools.

## Phase 4: Reminders

- follow-ups
- due-date nudges
- attention requests

### Phase 4 modules

- reminder scheduler
- follow-up rules
- escalation / notification hooks

**Goal:** keep work from stalling.

## Phase 5: Progress tracking

- status over time
- milestone visibility
- project health views

### Phase 5 modules

- progress snapshots
- status history
- project health summaries

**Goal:** answer what is moving, blocked, or done.

## Phase 6: Customer reporting

- client-facing summaries
- delivery status snapshots
- outcome reporting

### Phase 6 modules

- report generation
- customer-facing summary views
- export / share hooks

**Goal:** make progress easy to share externally.

## Phase 7: Agent improvement loops

- outcome feedback
- approval/result correlation
- repeated-task learning signals
- quality review inputs

### Phase 7 modules

- agent feedback capture
- outcome labeling
- review signal aggregation
- improvement signal analysis

**Goal:** improve agent behavior from real work history.

## Roadmap rules

- keep each phase shippable
- preserve auditability across phases
- prefer simple coordination primitives over broad abstraction
- keep service boundaries visible even when everything is still in one app
- treat boards and flow visibility as the main operating surface, with approvals and audit layered around them
