<p align="center">
  <img src="docs/assets/logo.png" alt="RelayHQ" width="120" />
</p>

<h1 align="center">RelayHQ</h1>

<p align="center">
  <strong>Vault-first Kanban for humans and AI agents. Git is your database.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://github.com/amas-nghia/RelayHQ/stargazers"><img src="https://img.shields.io/github/stars/amas-nghia/RelayHQ?style=social" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/built%20with-Bun%20%2B%20React%20%2B%20Go-blueviolet" alt="Stack" />
  <img src="https://img.shields.io/badge/vault-Markdown%20%2B%20Git-orange" alt="Vault" />
</p>

<p align="center">
  <a href="https://relayhq.gitbook.io">Docs</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#agent-protocol">Agent Protocol</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

---

<!-- screenshot placeholder — replace with actual screenshot -->
<!-- ![RelayHQ board](docs/assets/screenshot.png) -->

## What is RelayHQ

RelayHQ is a **Kanban control plane** where your task board lives in Markdown files committed to Git — no Postgres, no Redis, no proprietary database.

It coordinates work across **humans and AI agents** through a shared vault: every task, approval, and audit note is a plain `.md` file with YAML frontmatter. Your editor, your Git history, your rules.

Agents interact via a minimal CLI or HTTP API. Humans interact via a React web UI. Both read and write the same vault.

```
vault/shared/tasks/task-001.md   ← a task is just a file
vault/shared/approvals/apr-001.md
vault/shared/audit/note-001.md
```

## Why vault-first

Most agent coordination tools bolt a database on the side. RelayHQ flips the model:

- **Git is the history** — every state change is a commit, auditable forever
- **Markdown is the API** — any tool that reads files can query the state
- **No infrastructure to operate** — clone the repo, start the dev server, done
- **Agents and humans share the same source of truth** — no sync, no drift

## Features

- **Kanban board** — visual task flow with drag-and-drop columns
- **Task lifecycle API** — claim, heartbeat, request-approval, complete
- **Approval workflow** — humans gate risky agent actions before they run
- **Audit trail** — every action writes a note, persisted in the vault
- **Agent registry** — define capabilities, approval requirements, and task types per agent
- **CLI for agents** — any agent runtime can interact without a custom SDK

## Quick Start

**Prerequisites:** [Bun](https://bun.sh) · [Node.js 18+](https://nodejs.org)

```bash
git clone https://github.com/amas-nghia/RelayHQ.git
cd RelayHQ

# Start the API server (port 4310) and web UI (port 3001)
npm install -g pm2
pm2 start ecosystem.config.cjs

# Open http://localhost:3001
```

Or run individually:

```bash
# API server
cd app && bun install && bun run dev   # → http://localhost:4310

# Web UI (separate terminal)
cd web && bun install && bun run dev   # → http://localhost:3001
```

## Agent Protocol

Any agent runtime can interact with RelayHQ using the CLI or HTTP API.

```bash
# 1. Find tasks assigned to you
bun run ./cli/relayhq.ts tasks --assignee=my-agent

# 2. Claim a task to start work
bun run ./cli/relayhq.ts claim task-001 --assignee=my-agent

# 3. Send heartbeats while working
bun run ./cli/relayhq.ts heartbeat task-001 --assignee=my-agent

# 4. Request human approval before risky actions
bun run ./cli/relayhq.ts request-approval task-001 \
  --assignee=my-agent \
  --reason="About to run database migration"

# 5. Mark done with a result
bun run ./cli/relayhq.ts update task-001 \
  --assignee=my-agent \
  --status=done \
  --result="Migration complete. PR #42 opened."
```

Under the hood, each of these writes a Markdown file to `vault/shared/`. No magic.

Override the server URL:

```bash
RELAYHQ_BASE_URL=http://your-server:4310 bun run ./cli/relayhq.ts tasks
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    Vault (Git)                  │
│  vault/shared/tasks/     ← task state           │
│  vault/shared/approvals/ ← approval records     │
│  vault/shared/audit/     ← audit notes          │
│  vault/shared/agents/    ← agent registry       │
└────────────────┬────────────────────────────────┘
                 │ read / write
       ┌─────────┴─────────┐
       │                   │
  ┌────▼────┐         ┌────▼────────────┐
  │  API    │         │   React Web UI  │
  │ Nuxt 3  │         │   (port 3001)   │
  │ :4310   │         │  Kanban Board   │
  └────┬────┘         └─────────────────┘
       │
  ┌────▼────────────┐
  │  Agent CLI      │
  │  Any Runtime    │
  │  (Claude, GPT…) │
  └─────────────────┘
```

**RelayHQ coordinates work. It does not execute work.**

The agent runtime (Claude Code, OpenAI Assistants, your custom loop) handles execution. RelayHQ handles ownership, approval, traceability, and progress.

## Vault file shape

Each task is a Markdown file with YAML frontmatter:

```markdown
---
id: task-001
type: task
version: 1
title: Implement login endpoint
status: in-progress
column: in-progress
priority: high
assignee: agent-backend-dev
approval_needed: false
progress: 40
heartbeat_at: 2026-04-24T10:30:00Z
execution_started_at: 2026-04-24T09:00:00Z
---

Implement JWT-based login for `/api/auth/login`.
Acceptance: returns 200 with token on valid credentials.
```

## Repository layout

```
RelayHQ/
├── app/          # Nuxt 3 API server — task lifecycle routes (port 4310)
├── web/          # React + Vite UI — Kanban board, approvals, audit (port 3001)
├── backend/      # Go validation library (canonical schema types)
├── cli/          # Agent CLI (relayhq.ts)
├── vault/        # Demo vault — seeded tasks, approvals, agents
└── docs/         # Documentation (GitBook)
```

## Documentation

Full docs at **[relayhq.gitbook.io](https://relayhq.gitbook.io)** (or `docs/`):

| Doc | Description |
|-----|-------------|
| [Vision](docs/vision.md) | What RelayHQ is and why |
| [Architecture](docs/architecture.md) | Three-layer model and boundaries |
| [Vault Structure](docs/vault/structure.md) | How vault files are organized |
| [Vault Schema](docs/vault/schema.md) | YAML frontmatter field reference |
| [Agent Definitions](docs/agents/definitions.md) | Agent registry format |
| [Agent Protocol](docs/agents/protocol.md) | How agents interact with RelayHQ |
| [Roadmap](docs/roadmap.md) | Phased growth plan |

## Roadmap

- [x] Phase 1 — Core Kanban: tasks, boards, columns, assignment, approvals, audit
- [ ] Phase 2 — Plans and task breakdowns (structured execution plans)
- [ ] Phase 3 — Chat (coordination threads tied to work)
- [ ] Phase 4 — Reminders (stale and blocked work nudges)
- [ ] Phase 5 — Progress tracking (status over time, project health)
- [ ] Phase 6 — Customer reporting (client-facing delivery summaries)
- [ ] Phase 7 — Agent improvement loops (outcome feedback, quality signals)

## API routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/vault/read-model` | Full board state |
| POST | `/api/vault/tasks` | Create a task |
| PATCH | `/api/vault/tasks/[id]` | Update task fields |
| POST | `/api/vault/tasks/[id]/claim` | Claim a task |
| POST | `/api/vault/tasks/[id]/heartbeat` | Send heartbeat |
| POST | `/api/vault/tasks/[id]/request-approval` | Request approval |
| POST | `/api/vault/tasks/[id]/approve` | Approve a task |
| POST | `/api/vault/tasks/[id]/reject` | Reject a task |

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.

```bash
git checkout -b feature/my-feature
# make changes
git commit -m "feat: my feature"
git push origin feature/my-feature
# open a pull request
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Self-hosting

RelayHQ works anywhere you can run Node.js / Bun. Point `RELAYHQ_VAULT_ROOT` at any directory to use a custom vault location:

```bash
RELAYHQ_VAULT_ROOT=/data/my-vault pm2 start ecosystem.config.cjs
```

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Made for teams that coordinate humans and agents across real work.
</p>
