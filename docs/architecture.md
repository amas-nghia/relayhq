# Architecture

## System shape

- control plane: owns workflow, state, approvals, and history
- runtime: executes the actual agent work
- workspace: groups related projects and their coordination state
- audit trail: preserves what happened and why
- backend shell: Go HTTP API and domain modules
- frontend shell: React control-plane UI

## Core boundary

RelayHQ should manage coordination, not execution.

It should know:

- what work exists
- who owns it
- what needs approval
- what changed
- what should happen next

It should not become:

- the model runtime
- the shell tool runner
- the hidden session store
- the only place where execution state exists

## Data ownership

- RelayHQ owns coordination state
- the runtime owns execution details
- the workspace owns human-readable context
- the audit trail owns traceability

## Why this boundary matters

If RelayHQ depends too heavily on a specific runtime, it becomes hard to swap engines, preserve history, or keep the control plane stable.

The point of the architecture is to keep the coordination layer durable even as the runtime changes.

## Practical rule

Anything that affects ownership, approval, traceability, or progress belongs in RelayHQ.

Anything that only affects how an agent computes an answer belongs in the runtime.
