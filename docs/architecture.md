# Architecture

## Three layers

### 1) Domain model
- workspace → project → board → column → task
- assignment, approval, audit note, thread

### 2) Vault-first storage
- Markdown files are the source of truth
- YAML frontmatter carries queryable metadata
- Git preserves history and collaboration

### 3) API + UI
- Nuxt 3 app/API reads and writes the vault
- Vue UI coordinates human work
- runtime integrations stay outside RelayHQ

## Core boundary
RelayHQ coordinates work; it does not execute work.

RelayHQ should know:
- what work exists
- who owns it
- what needs approval
- what changed
- what should happen next

RelayHQ should not become:
- the model runtime
- the shell tool runner
- the hidden session store
- the only place where execution state exists

## Data ownership
- RelayHQ owns coordination state
- the runtime owns execution details
- Kioku owns semantic memory and retrieval
- the audit trail owns traceability

## Kioku integration contract
- RelayHQ is the source of truth for work state, approvals, and audit history.
- Kioku is retrieval-only semantic memory; it may index RelayHQ data, but it is never authoritative state.
- RelayHQ may read from Kioku for context, but it must continue to resolve canonical state from the vault.
- The Kioku client is a real service boundary: RelayHQ sends `POST /api/search` with `{ query }` and expects `{"hits": [...]}` back.
- If Kioku is unavailable, RelayHQ surfaces a `KiokuUnavailableError` and leaves the vault state untouched rather than inventing a fallback or placeholder result.

## Why this boundary matters
Keeping the control plane separate from execution makes RelayHQ swappable, auditable, and stable as runtimes change.

## Practical rule
Anything affecting ownership, approval, traceability, or progress belongs in RelayHQ.

Anything affecting how an agent computes an answer belongs in the runtime.
