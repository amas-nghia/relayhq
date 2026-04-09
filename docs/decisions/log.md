# Decision Log

## Durable current decisions

- **RelayHQ is a control plane for people and agents.**
  It coordinates work; it is not the runtime that does the work.

- **Phase 1 stays small and usable.**
  Start with the minimum set of coordination tools: project registry, task board, assignment, approvals, audit notes.

- **Human and agent work are both first-class.**
  The product must support handoff, ownership, and status across both audiences.

- **Traceability is a core requirement.**
  Decisions, approvals, and agent actions need an audit trail so teams can review what happened and why.

- **Build incrementally in small slices.**
  Each step should be shippable and understandable on its own.

- **The product does not start as a full automation platform.**
  It is intentionally narrower than orchestration, marketplace, or general agent-runtime products.

- **The repository docs are the source of truth while the product is a scaffold.**
  Scope and direction live in docs until implementation catches up.

## Why these decisions exist

- To keep the first release useful without becoming too broad.
- To support accountable work instead of hidden automation.
- To preserve context for approvals, handoffs, and future improvement.
- To make the product easy to extend without large rewrites.
