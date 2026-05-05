# RelayHQ

RelayHQ is a Kanban control plane for coordinating humans and agents across projects.

It stores work as Markdown files, exposes a REST API for mutations, and shows a real-time board UI where both humans and agents can see what is happening and what needs to happen next.

RelayHQ **coordinates** work. It does not execute work. The agent runtimes (Claude Code, opencode, etc.) are execution engines that plug into RelayHQ for task assignment, heartbeats, approvals, and audit.

## What it does

- Kanban boards with columns and task cards
- Assigns tasks to agents or humans
- Auto-dispatches agent sessions when a todo task is ready
- Requires approval gates before risky actions
- Records every state change in an audit trail
- Provides agents with task context and skill files at session start

## What it is not

- Not an agent runtime — it spawns agents but does not run them
- Not a chat app — coordinator chat is scoped to project coordination only
- Not a workflow engine — no code execution, no triggers, no automations beyond dispatch

## Services

| Service | Port | Command |
|---------|------|---------|
| API server (Nuxt 3 / Bun) | 44210 | `cd app && bun run dev` |
| Web UI (React / Vite) | 44211 | `cd web && npm run dev` |

## Docs

- [Getting Started](getting-started.md)
- [Architecture](architecture.md)
- [Vault Structure](vault/structure.md)
- [Vault Schema](vault/schema.md)
- [Agent Definitions](agents/definitions.md)
- [Agent Protocol](agents/protocol.md)
