<p align="center">
  <img src="docs/assets/logo.png" alt="RelayHQ" width="120" />
</p>

<h1 align="center">RelayHQ</h1>

<p align="center">
  <strong>The task board built for human–agent teams. Every task is a file. Git is the history.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://github.com/amas-nghia/RelayHQ/stargazers"><img src="https://img.shields.io/github/stars/amas-nghia/RelayHQ?style=social" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/built%20with-Bun%20%2B%20React%20%2B%20Go-blueviolet" alt="Stack" />
  <img src="https://img.shields.io/badge/works%20with-Claude%20Code-orange" alt="Claude Code" />
  <img src="https://img.shields.io/badge/vault-Markdown%20%2B%20Git-green" alt="Vault" />
</p>

<p align="center">
  <a href="https://amas.gitbook.io/relayhq">Docs</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#claude-code-integration">Claude Code</a> ·
  <a href="#agent-protocol">Agent Protocol</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

---

<!-- Replace with actual demo GIF -->
<!-- ![RelayHQ demo](docs/assets/demo.gif) -->

## The problem

You have AI agents doing real work — writing code, running tests, opening PRs. But coordinating them is a mess:

- **No shared context** — you paste the same background into every agent session
- **No visibility** — you can't tell which agent is working on what, or whether it's stuck
- **No guardrails** — agents run database migrations and deploy to production without asking
- **No history** — when something goes wrong, there's no audit trail

## What RelayHQ does

RelayHQ is a Kanban board where every task, approval, and audit note is a plain Markdown file committed to Git. AI agents read and write the same vault as your team — no special SDKs, no proprietary APIs, no database to operate.

```
vault/shared/tasks/task-001.md      ← agent claims this, works, marks done
vault/shared/approvals/apr-001.md   ← human reviews before risky actions run
vault/shared/audit/note-001.md      ← every action is recorded
```

Agents use the CLI or HTTP API. Humans use the web UI or their editor. Both write to the same files.

**RelayHQ coordinates work. It does not execute work.**

---

## Claude Code integration

RelayHQ is designed to work with Claude Code out of the box.

### 1-minute setup

Add RelayHQ to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "relayhq": {
      "command": "npx",
      "args": ["relayhq-mcp"],
      "env": {
        "RELAYHQ_BASE_URL": "http://127.0.0.1:44210"
      }
    }
  }
}
```

Restart Claude Code. You now have `relayhq_*` tools in every session:

```
relayhq_session_start   → get your task list and workspace context
relayhq_update_task     → report progress and mark tasks done
relayhq_heartbeat       → stay visible while working
relayhq_request_approval → ask a human before doing something risky
```

### Example Claude Code workflow

Add to your project's `CLAUDE.md`:

```markdown
## RelayHQ

At the start of each session, call `relayhq_session_start(agentId="claude-code")` 
to get the task list and workspace context.

Send a heartbeat every ~10 minutes: `relayhq_heartbeat(taskId, agentId)`.

When done: `relayhq_update_task(taskId, agentId, status="done", result="...")`.
```

Claude Code will now pick up tasks from your board, work on them, and report back — all visible in the UI and auditable in Git.

---

## Quick Start

**Prerequisites:** [Bun](https://bun.sh) · [Node.js 18+](https://nodejs.org)

```bash
git clone https://github.com/amas-nghia/RelayHQ.git
cd RelayHQ

# Start API server (port 44210) and web UI (port 44211)
npm install -g pm2
pm2 start ecosystem.config.cjs && pm2 save
```

Open [http://localhost:44211](http://localhost:44211) and follow the 3-step onboarding.

<details>
<summary>Run without PM2</summary>

```bash
# Terminal 1 — API server
cd app && bun install && bun run dev   # → http://localhost:44210

# Terminal 2 — Web UI
cd web && bun install && bun run dev   # → http://localhost:44211
```
</details>

---

## Use cases

**Solo developer + Claude Code**
Maintain a task board in your project repo. Claude Code picks up tasks automatically at session start, sends heartbeats, and asks before anything destructive. You see everything from the web UI.

**Multiple agents on the same repo**
Three Claude Code windows, one codebase. RelayHQ prevents two agents from claiming the same task via locks with expiry. The board shows which agent is active and what it's doing.

**Human–agent approval workflow**
An agent refactors an auth system, then calls `request-approval` before touching production configs. The task moves to the "waiting-approval" column. A human reviews and approves in the UI. The agent proceeds.

**Team with async contributors**
Humans create tasks in the UI. Agents pick them up, work, and write audit notes. At standup, the board reflects what happened — written by humans and agents alike, all in Git.

---

## Why not Jira / Linear / Notion

| | RelayHQ | Jira / Linear | Notion |
|---|---|---|---|
| AI agents can read & write natively | ✅ files + HTTP API | ❌ custom integration required | ❌ custom integration required |
| Full audit trail in Git | ✅ every change is a commit | ❌ proprietary | ❌ proprietary |
| Works offline / no internet | ✅ | ❌ | ❌ |
| Zero infrastructure to operate | ✅ clone + run | ❌ hosted or self-host DB | ❌ hosted |
| Human approval gates for agents | ✅ built-in | ❌ | ❌ |
| Tasks are plain Markdown | ✅ edit in any editor | ❌ | ✅ but not Git-native |

RelayHQ is not trying to replace your project management tool. It fills the gap between your AI agent runtime and your team's coordination layer.

---

## Features

- **Kanban board** — visual task flow across columns (Todo → In Progress → Review → Done)
- **Task lifecycle API** — claim, heartbeat, request-approval, complete
- **Human approval workflow** — gate risky agent actions before they run
- **Audit trail** — every action writes a note, persisted in Git forever
- **Multi-agent coordination** — lock/expiry prevents two agents working the same task
- **Agent registry** — define capabilities, approval requirements, and task types per agent
- **CLI for any runtime** — no custom SDK needed

---

## Agent Protocol

```bash
# 1. Find tasks assigned to you
bun run ./cli/relayhq.ts tasks --assignee=my-agent

# 2. Claim a task
bun run ./cli/relayhq.ts claim task-001 --assignee=my-agent

# 3. Heartbeat while working
bun run ./cli/relayhq.ts heartbeat task-001 --assignee=my-agent

# 4. Request human approval before risky actions
bun run ./cli/relayhq.ts request-approval task-001 \
  --assignee=my-agent \
  --reason="About to run database migration"

# 5. Mark done
bun run ./cli/relayhq.ts update task-001 \
  --assignee=my-agent --status=done --result="PR #42 opened."
```

Each command writes a Markdown file to `vault/shared/`. No magic, no black box.

Override the server URL: `RELAYHQ_BASE_URL=http://your-server:44210`

---

## Vault file shape

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

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Vault (Git repo)               │
│  vault/shared/tasks/     ← task state           │
│  vault/shared/approvals/ ← approval records     │
│  vault/shared/audit/     ← audit notes          │
│  vault/shared/agents/    ← agent registry       │
└────────────────┬────────────────────────────────┘
                 │ read / write markdown files
       ┌─────────┴──────────┐
       │                    │
  ┌────▼────┐          ┌────▼────────────┐
  │  API    │          │  React Web UI   │
  │ Nuxt 3  │◄────────►│  (port 44211)   │
  │ :44210  │          │  Kanban Board   │
  └────┬────┘          └─────────────────┘
       │
  ┌────▼──────────────────┐
  │  Any agent runtime    │
  │  Claude Code · GPT    │
  │  Custom loops · CLI   │
  └───────────────────────┘
```

---

## Repository layout

```
RelayHQ/
├── app/          # Nuxt 3 API server — task lifecycle routes (port 44210)
├── web/          # React + Vite UI — Kanban board, approvals, audit (port 44211)
├── backend/      # Go validation library (canonical schema types)
├── cli/          # Agent CLI (relayhq.ts)
├── vault/        # Demo vault — seeded tasks, approvals, agents
└── docs/         # Documentation
```

---

## Roadmap

- [x] Phase 1 — Core Kanban: tasks, boards, columns, assignment, approvals, audit
- [ ] Phase 2 — Plans and task breakdowns
- [ ] Phase 3 — Coordination threads tied to work
- [ ] Phase 4 — Stale and blocked work nudges
- [ ] Phase 5 — Project health and progress tracking
- [ ] Phase 6 — GitHub Issues sync
- [ ] Phase 7 — Agent improvement loops (outcome feedback, quality signals)

---

## API reference

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/vault/read-model` | Full board state |
| POST | `/api/vault/tasks` | Create a task |
| PATCH | `/api/vault/tasks/[id]` | Update task fields |
| POST | `/api/vault/tasks/[id]/claim` | Claim a task |
| POST | `/api/vault/tasks/[id]/heartbeat` | Send heartbeat |
| POST | `/api/vault/tasks/[id]/request-approval` | Request approval |
| POST | `/api/vault/tasks/[id]/approve` | Approve |
| POST | `/api/vault/tasks/[id]/reject` | Reject |
| GET | `/api/agent/session` | Session start — task list + workspace context |

---

## Self-hosting

Point `RELAYHQ_VAULT_ROOT` at any directory to use a custom vault:

```bash
RELAYHQ_VAULT_ROOT=/data/my-vault pm2 start ecosystem.config.cjs
```

Works anywhere you can run Node.js + Bun.

---

## Contributing

Open an issue first to discuss what you'd like to change.

```bash
git checkout -b feature/my-feature
# make changes
git commit -m "feat: my feature"
git push origin feature/my-feature
# open a pull request
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Documentation

Full docs at **[https://amas.gitbook.io/relayhq](https://amas.gitbook.io/relayhq)** — product overview, vault schema, agent protocol, architecture.

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Built for teams where humans and AI agents work side by side.
</p>
