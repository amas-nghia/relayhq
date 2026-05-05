# Architecture

## Overview

RelayHQ has three layers:

1. **Vault** — Markdown files with YAML frontmatter. The canonical source of truth. No database.
2. **API server** — Nuxt 3 on Bun (port 44210). Reads and writes the vault. All mutations go through here.
3. **Web UI** — React 19 + Vite (port 44211). Reads the API. Sends real-time updates via SSE.

```
Browser (React UI : 44211)
        │  SSE + REST
        ▼
API Server (Nuxt 3 / Bun : 44210)
        │
        ▼
Vault (Markdown files on disk)
        │
        ▼
Git (history + review)
```

## Tech stack

| Layer | Tech | Entry point |
|-------|------|-------------|
| API server | Nuxt 3 + Bun | `app/` |
| Web UI | React 19 + Vite | `web/` |
| Vault | Markdown + YAML | `vault/shared/` |
| Go schema | Go | `backend/internal/vault/schema.go` |
| CLI | Bun script | `cli/relayhq.ts` |
| MCP server | Node.js | `packages/relayhq-mcp/` |
| Agent SDK | TypeScript | `packages/agent-sdk/` |

## Key directories

```
app/server/
├── api/vault/          # task lifecycle, projects, boards, agents, docs
├── api/agent/          # session start, context, bootstrap, dispatch
├── api/settings/       # API keys, shell profile, skills
├── api/analytics/      # cost, velocity, usage by provider
├── services/agents/    # launch.ts, dispatch.ts, skills.ts, capacity.ts
├── services/vault/     # read.ts, write.ts, task-lifecycle.ts
├── services/policy/    # work-policy.ts — role enforcement
└── plugins/            # assigned-task-dispatcher.ts, scheduled-task-sweeper.ts

web/src/
├── pages/              # DesktopView, BoardView, TasksView, AgentsView, ...
├── components/layout/  # Shell, Sidebar, AgentSetupWizard
├── store/appStore.ts   # Zustand + SSE sync
└── api/client.ts       # typed API client
```

## Vault root resolution

The API resolves the vault root in this order:

1. `RELAYHQ_VAULT_ROOT` env var — use directly
2. Running from `app/` — resolve `..` to the repo root
3. Otherwise — current working directory

All shared vault files live at `vault/shared/{type}/*.md` under the resolved root.

## Auto-dispatcher

Two Nitro plugins run on server start:

- **assigned-task-dispatcher** — every 30 seconds, scans all `todo` tasks. For unassigned tasks, calls `selectAgentForTask` which scores available agents by how their `task_types_accepted` and `capabilities` overlap with the task's `tags`. The highest-scoring agent is assigned and an agent session is launched in the background.
- **scheduled-task-sweeper** — handles tasks with `next_run_at` set, moving them back to `todo` when their scheduled time arrives.

Both plugins are enabled by default. Disable with `RELAYHQ_DISABLE_AUTO_DISPATCH=true`.

**Important:** Tasks must have at least one `tag` that matches an agent's `task_types_accepted` or `capabilities`, or no agent will be selected.

## Agent launch pipeline

```
POST /api/agent/:id/run
  → dispatch.ts   (evaluateDispatch — checks readiness, capacity, active sessions)
  → launch.ts     (resolveCommand — builds CLI args for opencode/claude-code)
  → manager.ts    (startRunner — spawns subprocess, pipes stdout/stderr)
  → session-events.ts (appendAgentSessionEvent → vault/shared/threads/agent-session-*.jsonl)
  → session-registry.ts (records session in vault/shared/threads/agent-task-sessions.json)
```

The agent subprocess receives its API key via environment variable injection. The agent's `api_key_ref` field (e.g. `env:ANTHROPIC_API_KEY`) is resolved at launch time and injected as the provider's standard env var.

## Work policy

Every agent action is gated by `app/server/services/policy/work-policy.ts`. Each actor resolves to one of:

- `coordinator` — agent with `role: coordinator`
- `worker` — all other registered agents
- `human` — unregistered actor ID

`assertWorkPolicy` throws HTTP 403 if the actor is not permitted for the requested action. This enforces that humans cannot claim agent tasks, coordinators cannot do worker tasks, etc.

## Skills system

Skills are `.md` files with YAML frontmatter, installed to `~/.relayhq/skills/`. At session start, the agent context API (`GET /api/agent/context`) injects matching skills into the bootstrap pack based on the task's type and tags.

```yaml
---
name: skill-code-review
version: 1.0.0
description: Code review checklist and standards
task_types: [code-review, bug-fix]
applies_to_tags: [review, quality]
---
```

The `skills/` directory in this repo contains templates. Copy them to `~/.relayhq/skills/` to activate.

## API contract

`app/server/api/contract-alignment.test.ts` verifies that every API response shape matches what `web/src/api/client.ts` expects. Run this test whenever you change an API response shape.

## Source of truth hierarchy

| What | Where |
|------|-------|
| Vault file shape | `docs/vault/schema.md` + `backend/internal/vault/schema.go` |
| TS schema / allowed models | `app/shared/vault/schema.ts` |
| Agent behavior | `docs/agents/protocol.md` |
| API contract (server ↔ web) | `app/server/api/contract-alignment.test.ts` |

## Core boundary

RelayHQ owns **coordination state**: task ownership, approval, progress, audit trail.

The agent runtime owns **execution details**: model calls, tool use, token counts.

Never blur this boundary. If something affects how an agent computes an answer, it belongs in the runtime. If it affects ownership, traceability, or who approved what, it belongs in RelayHQ.
