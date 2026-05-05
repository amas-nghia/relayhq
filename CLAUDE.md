# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RelayHQ is a **vault-first Kanban control plane** for coordinating humans and agents across projects. It coordinates work; it does not execute work. The vault (Markdown files + YAML frontmatter + Git) is the canonical source of truth — not a cache.

## Repository layout

```
RelayHQ-vault-first/
├── app/                        # Nuxt 3 API server (Bun) — port 44210
│   ├── server/
│   │   ├── api/
│   │   │   ├── vault/          # task lifecycle: read-model, tasks, claim, approve, agents, docs
│   │   │   │   └── projects/[id]/  # coordinator-thread + coordinator-chat routes
│   │   │   ├── agent/          # agent coordination: session, context, bootstrap, search, run, dispatch
│   │   │   ├── runners/        # process manager routes: available-clis, active runners
│   │   │   ├── analytics/      # activity, cost, velocity, summary, providers endpoints
│   │   │   └── settings/       # settings r/w, agent scanning, registration, verify-key, skills
│   │   ├── services/
│   │   │   ├── agents/         # launch.ts, dispatch.ts, skills.ts, session-events.ts, autorun.ts, session-registry.ts, capacity.ts
│   │   │   ├── runners/        # manager.ts — spawns and tracks agent subprocesses
│   │   │   ├── vault/          # read.ts, write.ts, runtime.ts, coordinator-thread.ts, task/agent state normalizers
│   │   │   ├── analytics/      # provider-usage.ts
│   │   │   └── policy/         # work-policy.ts — coordinator/worker/human actor role enforcement
│   │   └── models/             # read-model.ts — canonical in-memory projection
│   ├── shared/vault/           # TS schema (ALLOWED_MODELS, assertAgentFrontmatter, etc.)
│   ├── scripts/                # one-off vault migration scripts (migrate-task-dispatch-state, reset-agent-state, reset-task-columns-state)
│   └── test/                   # seeded-vault regression tests
├── web/                        # React 19 + Vite board UI — port 44211
│   └── src/
│       ├── pages/              # DesktopView (windowed OS shell), BoardView, TasksView, AgentsView, ApprovalsView, AuditView, DocsView
│       ├── components/
│       │   ├── live-world/     # DesktopAgentScene, WorldCanvas, agentMotion.ts — sprite physics layer
│       │   ├── layout/         # Shell, Sidebar, AgentSetupWizard, OnboardingWizard
│       │   └── task/           # DetailPanel and task UI primitives
│       ├── store/appStore.ts   # Zustand store + SSE realtime sync
│       └── api/client.ts       # typed API client (calls port 44210)
├── packages/
│   ├── agent-sdk/              # @relayhq/agent-sdk — typed helpers for agent lifecycle APIs
│   └── relayhq-mcp/            # MCP server (relayhq-mcp) — exposes RelayHQ tools to Claude/agents
├── backend/
│   └── internal/vault/         # schema.go — canonical Go types + validators (ground truth)
├── cli/
│   └── relayhq.ts              # minimal agent CLI over local HTTP
├── skills/                     # repo-local skill templates (skill-code-review, skill-bug-fix, etc.)
├── vault/
│   ├── shared/                 # committed coordination state — source of truth
│   └── users/                  # private overlays — must stay gitignored
└── ecosystem.config.cjs        # PM2: relayhq-api (44210) + relayhq-web (44211)
```

## Commands

### Nuxt API server (app/)

```bash
cd app
bun install
bun run dev          # port 44210
bun run typecheck
bun test
bun test --test-name-pattern "pattern"
```

### React web UI (web/)

```bash
cd web
npm install
npm run dev          # port 44211, proxies API to 44210
npm run lint         # tsc --noEmit
```

### Backend (backend/)

```bash
cd backend
go test ./...
go test -race ./...
```

### CLI

```bash
bun run ./cli/relayhq.ts tasks --assignee=<agentId>
bun run ./cli/relayhq.ts claim <taskId> --assignee=<agentId>
bun run ./cli/relayhq.ts heartbeat <taskId> --assignee=<agentId>
bun run ./cli/relayhq.ts update <taskId> --assignee=<agentId> --status=review --progress=100 --result="..."
```

Default base URL `http://127.0.0.1:44210` — override with `RELAYHQ_BASE_URL` or `--base-url`.

### Migration scripts (app/)

```bash
cd app
bun run ./scripts/migrate-task-dispatch-state.ts   # normalize task dispatch fields
bun run ./scripts/reset-agent-state.ts             # reset agent frontmatter state
bun run ./scripts/reset-task-columns-state.ts      # reset task column assignments
```

### MCP server

```bash
cd packages/relayhq-mcp && npm install
node bin/relayhq-mcp.mjs   # connects to RELAYHQ_BASE_URL (default 127.0.0.1:44210)
```

### PM2

```bash
pm2 start ecosystem.config.cjs && pm2 save
pm2 restart relayhq-api    # after server-side changes
```

### Environment (app/.env)

```
RELAYHQ_VAULT_ROOT=/path/to/vault   # required when vault lives outside the repo
CORS_ORIGIN=http://localhost:44211,http://127.0.0.1:44211
```

## Architecture

### Three layers

1. **Domain model** — workspace → project → board → column → task; plus assignment, approval, audit note, doc
2. **Vault-first storage** — `vault/shared/**` is committed Git state; `vault/users/**` is private overlay (gitignored); mutations go through API, never direct file writes
3. **API + UI** — Nuxt 3 (`app/`) serves all API routes; React (`web/`) consumes them; SSE (`/api/vault/events` or equivalent) drives realtime updates in `appStore.ts`

### Core boundary

RelayHQ owns coordination state (ownership, approval, traceability, progress). The agent runtime owns execution details. Never blur this boundary.

### Vault root resolution (`app/server/services/vault/runtime.ts`)

- `RELAYHQ_VAULT_ROOT` env var → use directly
- running from `app/` → resolve repo root via `..`
- otherwise → current working directory

Shared files live at `vault/shared/{type}/*.md` relative to resolved root.

### Vault file shape

Each vault object is one Markdown file with YAML frontmatter. Key task fields:
- `column`: `todo | in-progress | review | done`
- `status`: `todo | scheduled | in-progress | blocked | review | waiting-approval | done | cancelled`
- `priority`: `critical | high | medium | low`
- `locked_by`, `locked_at`, `lock_expires_at` — optimistic locking for concurrent agents
- `next_run_at`, `cron_schedule` — used for scheduled/recurring tasks
- `api_key_ref` — must use `env:VAR`, `secret:name`, or `vault:path` prefix; never raw values

### Agent launch pipeline

```
POST /api/agent/:id/run
  → dispatch.ts  (evaluateDispatch — checks readiness, runtime, active sessions)
  → launch.ts    (resolveCommand → builds opencode/claude-code/codex args)
  → manager.ts   (startRunner — spawns subprocess, pipes stdout/stderr)
  → session-events.ts (appendAgentSessionEvent → vault/shared/threads/agent-session-*.jsonl)
  → session-registry.ts (records session in vault/shared/threads/agent-task-sessions.json)
```

`launch.ts:makeLineStreamParser` parses JSON lines from agent stdout:
- `{type:"text", part:{text}}` → `reasoning.summary`
- `{type:"thinking", part:{thinking}}` → `reasoning.summary`
- `{type:"tool_use"}` → `terminal.stdout [tool_use]`
- `{type:"step_start/finish"}` → `terminal.stdout [raw]`

OpenCode is launched with `--format json --thinking --dangerously-skip-permissions`. PTY wrapping (`script -qec`) is used for opencode background runs.

### Work policy system (`app/server/services/policy/work-policy.ts`)

Every agent action is gated by a work policy decision. Actors are resolved into one of three kinds:
- `coordinator` — agent with `role: coordinator` (or `roles` array containing `"coordinator"`)
- `worker` — all other registered agents
- `human` — unregistered actor ID

`assertWorkPolicy` throws HTTP 403 if the actor is not permitted for the requested action. `isCoordinatorAgent` / `isCoordinatorTask` are the fast-path helpers used by dispatch routes.

### Coordinator chat flow (`app/server/api/vault/projects/[id]/coordinator-chat.post.ts`)

Per-project coordinator threads allow human↔coordinator dialogue:
- `POST /api/vault/projects/:id/coordinator-thread` — open/get the coordinator thread
- `GET /api/vault/projects/:id/coordinator-thread` — read current thread state
- `POST /api/vault/projects/:id/coordinator-chat` — send message or launch/resume coordinator session (`mode: fresh | resume | reset`)

The coordinator chat endpoint de-duplicates concurrent launches via an in-memory map keyed by `projectId`.

### Skills system

Skills are `.md` files with YAML frontmatter loaded from `~/.relayhq/skills/` at runtime:
```yaml
---
name: skill-name
version: 1.0.0
description: ...
task_types: [feature-implementation, bug-fix]
applies_to_tags: [tag1, tag2]
---
```
Agent context API injects matching skills into the bootstrap pack. `skills/` in the repo contains templates; install them to `~/.relayhq/skills/` to activate.

### Active HTTP routes

**Vault (`/api/vault/`):**
- `GET /read-model` — full workspace snapshot
- `POST /tasks`, `PATCH /tasks/[id]`
- `POST /tasks/[id]/claim|heartbeat|request-approval|approve|reject`
- `GET /agents`, `POST /agents`
- `PATCH /agents/[id]`
- `POST /assets/agent-avatar` — upload agent avatar
- `GET /projects`, `POST /projects`, `GET|PATCH /projects/[id]`
- `GET|POST /projects/[id]/coordinator-thread`
- `POST /projects/[id]/coordinator-chat`
- `GET /docs`, `POST /docs`, `GET|PATCH /docs/[id]`
- `GET /audit-notes`
- `POST /init` — seed an empty vault
- `GET /api/health`, `GET /api/metrics`

**Agent (`/api/agent/`):**
- `GET /session` — workspace context + task list for session start
- `GET /context` — full bootstrap pack (skills injected here)
- `GET /state` — lightweight current state
- `GET /planner-context`
- `POST /tasks`, `GET /tasks`
- `POST /tasks/[id]/claim-next`
- `POST /[id]/run` — dispatch and launch an agent session
- `POST /[id]/resume` — resume a previous session
- `GET /[id]/sessions` — list sessions for a specific agent
- `GET /sessions`, `GET /sessions/[sessionId]`, `DELETE /sessions/[sessionId]`
- `GET /sessions/[sessionId]/messages`
- `GET /sessions/[sessionId]/usage` — token usage for a session
- `POST /search`, `GET /search-code`, `POST /search-docs`
- `GET /active`

**Settings (`/api/settings/`):**
- `GET /api-keys`, `GET /skills`
- `POST /verify-key` — validate an API key against its provider (Anthropic, OpenAI, etc.)
- `GET /shell-profile`, `POST /shell-profile`
- `GET|POST /webhooks`

**Runners:** `GET /api/runners/available-clis`

**Analytics:** `GET /api/analytics/agents`, `/cost`, `/velocity`, `/summary`, `/activity`, `/providers`

**API reference:** `GET /api/openapi.json` — OpenAPI spec; `GET /api/scalar` — Scalar UI (loads spec client-side)

`app/server/api/contract-alignment.test.ts` — run this whenever changing any agent API response shape; it verifies the server response matches what `web/src/api/client.ts` expects.

### Go validation

`backend/internal/vault/schema.go` is the ground truth for valid vault files. Keep in sync with `docs/vault/schema.md`. TypeScript schema lives in `app/shared/vault/schema.ts` (`ALLOWED_MODELS`, `assertAgentFrontmatter`, etc.).

### Agent protocol (summary)

1. Claim: `POST /api/vault/tasks/:id/claim` — sets `status: in-progress`, `execution_started_at`, `heartbeat_at`
2. Heartbeat: `POST /api/vault/tasks/:id/heartbeat` every ~10 min; also PATCH `progress` + `execution_notes`
3. Approval: `POST /api/vault/tasks/:id/request-approval` → `status: waiting-approval`, stop
4. Done: PATCH `status: review`, `progress: 100`, `result`
5. Blocked: PATCH `status: blocked`, `blocked_reason`, `blocked_since`

## Scope rules

- Phase 1 scope: project registry, task board, column flow, assignment, approvals, audit notes, agent dispatch
- `vault/users/**` must never appear in shared commits
- All API mutations go through HTTP routes — never write vault files directly from application code
- If docs conflict, the more specific doc wins (`docs/vault/*` > `docs/architecture.md`)

## Source-of-truth hierarchy

| What | Where |
|------|-------|
| Vault file shape | `docs/vault/schema.md` + `backend/internal/vault/schema.go` |
| TS schema / allowed models | `app/shared/vault/schema.ts` |
| Agent behavior | `docs/agents/protocol.md` |
| API contract (server ↔ web) | `app/server/api/contract-alignment.test.ts` |
| Product direction | `README.md`, `docs/architecture.md`, `docs/roadmap.md` |
