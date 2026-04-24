# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RelayHQ is a **vault-first Kanban control plane** for coordinating humans and agents across projects. It coordinates work; it does not execute work. The vault (Markdown files + YAML frontmatter + Git) is the canonical source of truth — not a cache.

Current branch `vault-first-rebuild` now contains a seeded Phase 1 implementation: the Nuxt app reads and writes canonical vault state, the task lifecycle APIs are live, and the shared demo vault is committed for verification.

## Repository layout

```
RelayHQ-vault-first/
├── app/                        # Nuxt 3 API server (Bun) — port 44210
│   ├── components/             # UI surfaces: board, approvals, tasks, nav, empty states
│   ├── data/                   # UI selectors/projections over the canonical read model
│   ├── pages/                  # overview, project, board, task, approvals, agents
│   ├── server/
│   │   ├── api/
│   │   │   ├── vault/          # vault task lifecycle routes (read-model, tasks, claim, etc.)
│   │   │   └── agent/          # agent session, context, search, planner-context, bootstrap
│   │   ├── models/             # canonical read model projection
│   │   └── services/           # vault read/write, agents, security, kioku integration
│   ├── shared/vault/           # TS schema + layout helpers for vault records
│   ├── test/                   # seeded-vault regression coverage
│   ├── nuxt.config.ts
│   └── package.json
├── web/                        # React 19 + Vite board UI (Bun) — port 44211
│   ├── src/
│   │   ├── pages/              # TasksView, BoardView, ApprovalsView, AgentsView, AuditView
│   │   ├── components/         # layout (Shell, Sidebar, TopBar), ui, task, live-world
│   │   ├── store/              # Zustand app store
│   │   └── api/                # typed API client (calls app/ on port 44210)
│   └── package.json            # React 19, React Router, Tailwind CSS v4, PixiJS, Motion
├── backend/
│   ├── go.mod                  # module: relayhq/backend
│   └── internal/vault/
│       ├── schema.go           # canonical Go types + validation helpers
│       └── schema_test.go
├── cli/
│   └── relayhq.ts              # minimal agent CLI using the same local HTTP APIs as the UI
├── docs/
│   ├── index.md                # reading order and source-of-truth rules
│   ├── architecture.md         # three-layer model + boundaries
│   ├── phase-1-checklist.md    # implementation checklist used for current slice
│   ├── ux-design.md            # current Phase 1 UX requirements
│   ├── vault/
│   │   ├── structure.md        # vault directory layout
│   │   └── schema.md           # file schemas with YAML frontmatter examples
│   ├── agents/
│   │   ├── definitions.md      # agent registry format
│   │   └── protocol.md         # how agents interact with RelayHQ
│   └── roadmap.md              # phased growth plan
├── vault/
│   ├── shared/                 # canonical committed Phase 1 demo records
│   │   ├── workspaces/
│   │   ├── projects/
│   │   ├── boards/
│   │   ├── columns/
│   │   ├── tasks/
│   │   ├── approvals/
│   │   ├── agents/
│   │   ├── audit/
│   │   └── threads/
│   ├── users/                  # private overlays, must stay gitignored
│   └── system/                 # schema/template assets when introduced
├── ecosystem.config.cjs        # PM2: relayhq-api (44210) + relayhq-web (44211)
└── CLAUDE.md
```

## Commands

### Nuxt API server (app/)

```bash
cd app
bun install
bun run dev          # dev server on port 44210
bun run build
bun run preview
bun run typecheck
bun test
bun test --test-name-pattern "pattern"   # run a single test by name
```

### React web UI (web/)

```bash
cd web
npm install
npm run dev          # dev server on port 44211 (proxies API to port 44210)
npm run build
npm run lint         # tsc --noEmit
```

### Backend (backend/)

```bash
cd backend
go test ./...                          # all tests
go test ./internal/vault/...           # vault package only
go test -race ./...                    # with race detector
```

### CLI (repo root)

```bash
bun run ./cli/relayhq.ts tasks --assignee=agent-backend-dev
bun run ./cli/relayhq.ts claim task-001 --assignee=agent-backend-dev
bun run ./cli/relayhq.ts heartbeat task-001 --assignee=agent-backend-dev
bun run ./cli/relayhq.ts request-approval task-003 --assignee=agent-backend-dev --reason="Need sign-off"
bun run ./cli/relayhq.ts update task-001 --assignee=agent-backend-dev --status=done --progress=100 --result="Completed"
```

CLI transport notes:
- default base URL: `http://127.0.0.1:44210`
- override with `RELAYHQ_BASE_URL`
- or pass `--base-url=<url>`

### PM2 (dev services)

```bash
pm2 start ecosystem.config.cjs && pm2 save   # first time
pm2 start all / pm2 stop all / pm2 logs
```

Claude commands: `/pm2-all`, `/pm2-3000`, `/pm2-logs`, `/pm2-status`

## Architecture

### Three layers

1. **Domain model** — workspace → project → board → column → task; plus assignment, approval, audit note
2. **Vault-first storage** — `vault/shared/**` is committed Git state (authoritative); `vault/users/**` is per-user private overlay (must be gitignored); `vault/system/**` holds schema/template assets
3. **API + UI** — Nuxt 3 (`app/`) serves the API and server-rendered pages; React (`web/`) is the board UI consuming that API

### Core boundary

RelayHQ owns coordination state (ownership, approval, traceability, progress). The agent runtime owns execution details. Never blur this boundary.

### Vault file shape

Each vault object is one Markdown file with YAML frontmatter. Key fields for tasks:

- `id`, `type: task`, `version: 1`
- `workspace_id`, `project_id`, `board_id`
- `column`: `todo | in-progress | review | done`
- `status`: `todo | in-progress | blocked | waiting-approval | done | cancelled`
- `priority`: `critical | high | medium | low`
- `approval_needed`, `approval_outcome`: `pending | approved | rejected`
- Lock fields: `locked_by`, `locked_at`, `lock_expires_at`

Current shared demo vault includes:
- 1 workspace
- 1 project
- 1 board
- 4 columns
- seeded tasks for todo, in-progress, and waiting-approval
- 1 approval record
- 1 agent registry record

### Go validation

`backend/internal/vault/schema.go` contains all canonical types (`TaskFrontmatter`, `AgentFrontmatter`, `WorkspaceFrontmatter`, etc.) and validators (`ValidateTaskFrontmatter`, `ValidateAgentFrontmatter`, etc.). These are the ground truth for what constitutes a valid vault file. Always keep validators in sync with `docs/vault/schema.md`.

### Vault Root Resolution

Runtime vault resolution lives in `app/server/services/vault/runtime.ts`:
- if `RELAYHQ_VAULT_ROOT` is set, use it directly
- otherwise, if the process is running from `app/`, resolve the repo root via `..`
- otherwise, use the current working directory as the repo root

Shared task files live at `vault/shared/tasks/*.md` relative to the resolved root.

### Active HTTP Routes

Vault task lifecycle (`app/server/api/vault/`):
- `GET /api/vault/read-model`
- `POST /api/vault/tasks`
- `PATCH /api/vault/tasks/[id]`
- `POST /api/vault/tasks/[id]/claim`
- `POST /api/vault/tasks/[id]/heartbeat`
- `POST /api/vault/tasks/[id]/request-approval`
- `POST /api/vault/tasks/[id]/approve`
- `POST /api/vault/tasks/[id]/reject`

Agent coordination (`app/server/api/agent/`):
- `GET /api/agent/session` — workspace context + task list for session start
- `GET /api/agent/context` — full task bootstrap pack
- `GET /api/agent/planner-context` — planning-scoped context
- `POST /api/agent/tasks` — create task as agent
- `GET /api/agent/tasks` — list tasks by assignee
- `POST /api/agent/tasks/[id]/claim-next` — claim next available task
- `POST /api/agent/search` — semantic search over vault
- `GET /api/agent/active` — active agent sessions

UI pages (Nuxt, `app/pages/`):
- `/`, `/projects/[project]`, `/boards/[board]`, `/tasks/[task]`, `/approvals`, `/agents`

React web UI pages (`web/src/pages/`):
- TasksView, BoardView, ApprovalsView, AgentsView, AuditView

### Agent protocol (summary)

Agents interact with the vault by:
1. Claiming a task: set `status: in-progress`, `execution_started_at`, `heartbeat_at`
2. During work: update `heartbeat_at`, `progress`, `execution_notes`
3. Approval needed: set `approval_needed: true`, `status: waiting-approval`, stop
4. Approval decision: keep task frontmatter and linked approval documents in sync
5. Done: set `status: done`, `result`, `completed_at`, write audit note
6. Blocked: set `status: blocked`, `blocked_reason`, `blocked_since`

Phase 1 verification already covers:
- seeded-vault dashboard/board/task selectors
- task creation into the canonical vault
- stale and contended lock handling
- approval lifecycle state sync between task and approval documents

## Scope rules

- Keep work within Phase 1: project registry, task board, column flow, assignment, approvals, audit notes
- Do not build runtime features, marketplace, analytics, or billing
- Private overlays (`vault/users/**`) must never appear in shared commits
- Secrets are references only (`api_key_ref: env:ANTHROPIC_API_KEY`), never raw values
- If docs conflict, the more specific doc wins (`docs/vault/*` > `docs/architecture.md`)

## Source-of-truth hierarchy

| What | Where |
|------|-------|
| Vault file shape | `docs/vault/schema.md` + `backend/internal/vault/schema.go` |
| Agent behavior | `docs/agents/protocol.md` |
| Product direction | `README.md`, `docs/vision.md`, `docs/architecture.md` |
| Product direction | `docs/roadmap.md` |
