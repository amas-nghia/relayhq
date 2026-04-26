<p align="center">
  <img src="docs/assets/logo.png" alt="RelayHQ" width="120" />
</p>

<h1 align="center">RelayHQ</h1>

<p align="center">
  <strong>Context that survives the handoff — across tools, models, and people.</strong>
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

Claude is already good at managing tasks inside a single session. The problem is what happens at the edges.

You switch to a cheaper model to save cost — and have to re-explain everything from scratch. You hand a task to a teammate — and paste the context into Slack. You pick up yesterday's work in a new session — and the thread is gone. You want a second agent to review what the first one did — but there's no shared record.

Every AI tool manages context well *within itself*. None of them share it *across* each other.

Token costs are rising. The smartest move isn't to use one expensive model for everything — it's to use the right tool at the right stage, and keep the context alive between them.

**That's what RelayHQ does.**

## How it works

Every task is a Markdown file — with its objective, acceptance criteria, constraints, notes, and history all in one place. When you finish thinking in Claude and hand off execution to a lighter model, a different CLI, a teammate, or your future self, the context comes with it. No copy-pasting. No re-explaining. One `git pull` and anyone — human or agent — is on the same page.

```
vault/shared/tasks/task-001.md      ← full context lives here, always
vault/shared/approvals/apr-001.md   ← human gates risky actions
vault/shared/audit/note-001.md      ← every move is recorded
```

Use Claude Opus to analyse and spec. Use a cheaper model to implement. Use a human to approve. Use Obsidian to browse and link everything. They all read and write the same files.

**RelayHQ coordinates work. It does not execute work.**

---

## Claude Code integration

RelayHQ is designed to work with Claude Code out of the box.

### 1-minute setup

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "relayhq": {
      "command": "npx",
      "args": ["relayhq-mcp"],
      "env": {
        "RELAYHQ_BASE_URL": "http://127.0.0.1:44210",
        "RELAYHQ_VAULT_ROOT": "/path/to/your/vault"
      }
    }
  }
}
```

> The onboarding wizard (step 3) generates this snippet with your vault path pre-filled and a copy button.

Restart Claude Code. You now have `relayhq_*` tools in every session:

```
relayhq_session_start    → task list + workspace context
relayhq_update_task      → report progress and mark done
relayhq_heartbeat        → stay visible while working
relayhq_request_approval → ask a human before risky actions
```

Add this to your project's `CLAUDE.md` and Claude Code will pick up tasks automatically:

```markdown
## RelayHQ
At session start: `relayhq_session_start(agentId="claude-code")`
Heartbeat every ~10 min: `relayhq_heartbeat(taskId, agentId)`
When done: `relayhq_update_task(taskId, agentId, status="done", result="...", tokens_used=18420, model="claude-sonnet-4-6", cost_usd=0.11)`
```

**Using OpenCode, Codex, or another tool?** See [docs/connect.md](docs/connect.md) for setup instructions for all supported agents.

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

Open [http://localhost:44211](http://localhost:44211) and follow the 3-step onboarding:

1. **Workspace** — create a new vault or connect an existing one
2. **Project** — name your first project and (optionally) point to the codebase
3. **Connect** — copy the MCP snippet into `~/.claude/settings.json` for Claude Code, or write the env vars to your shell profile for any CLI agent

### Option 3: Docker

```bash
docker compose up --build
```

This starts both services on the usual ports:
- API: `http://127.0.0.1:44210`
- Web: `http://127.0.0.1:44211`

Stop and clean up with:

```bash
docker compose down
```

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

**Mixed workflows — humans and agents in the same board**
Not every task should go to an agent. UI design, real-device testing, client calls, legal review — some things need a human. Assign those tasks to a person instead, drag them across columns, update status by hand. RelayHQ doesn't distinguish between human and agent at the data level: assignee is just a name, status is just a field. The board reflects the full picture of who is doing what, regardless of whether "who" is a person or a model.

**Split thinking from doing — keep costs low**
Token prices aren't dropping fast enough. Use an expensive model (Claude Opus, GPT-4o) to analyse the problem, write the spec, and break it into tasks. Then hand off to a cheaper model on a different CLI — or a human — to execute. Because every task is a Markdown file, the full context travels with it: objective, acceptance criteria, constraints, prior notes, all of it. No copy-pasting. No re-explaining. The expensive thinking happens once and stays in the vault.

This works across CLI tools, across machines, and across people. A solo dev can brainstorm with Claude in the morning and execute with a lighter model in the afternoon. A team can sync the entire vault through a shared Git repo — one `git pull` and everyone, human or agent, is on the same page. Prefer a visual knowledge base? Open the vault folder in [Obsidian](https://obsidian.md/) — tasks, docs, meeting notes, and audit logs are all plain Markdown, fully navigable and linkable.

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

### Core (available now)

- **Kanban board** — visual task flow across columns (Todo → In Progress → Review → Done)
- **Task lifecycle API** — claim, heartbeat, request-approval, complete
- **Human approval workflow** — gate risky agent actions before they run
- **Audit trail** — every action writes a note, persisted in Git forever
- **Multi-agent coordination** — lock/expiry prevents two agents claiming the same task
- **Agent registry** — define capabilities, approval requirements, and task types per agent
- **MCP integration** — `relayhq_*` tools available in Claude Code, OpenCode, and any MCP-compatible runtime
- **CLI for any runtime** — no custom SDK needed; plain HTTP + Markdown
- **Onboarding wizard** — 3-step setup: vault path, first project, connect your agent
- **Project view** — per-project task overview with status breakdown

### Coming next

- **Scheduled tasks** — defer work until later; agents self-schedule when they hit a rate limit, with model fallback chain
- **Recurring tasks** — cron expressions on any task; re-queue automatically on schedule
- **Task templates** — reusable task shapes with pre-filled objective, criteria, and context
- **Comments & threads** — per-task discussion attached to vault files; humans and agents leave notes in the same place
- **Real-time board** — WebSocket push instead of polling; status changes appear instantly
- **Agent subtasks** — parent tasks spawn child tasks; progress rolls up automatically

### Planned

- **Project docs** — attach briefs, meeting notes, specs, and links directly to a project; indexed for semantic search
- **Semantic search** — Kioku-powered full-text + vector search across all tasks and project documents
- **Notifications** — Slack messages and generic webhooks when tasks move, approvals are needed, or agents go stale
- **Analytics** — token usage, cost tracking, cycle time, and throughput per project and per agent
- **Mobile board** — horizontal scroll on small screens; touch-friendly drag and status updates
- **Agent SDK** — `@relayhq/agent-sdk` TypeScript package with typed helpers for all lifecycle operations
- **Skill system** — installable SKILL.md files that inject structured context into agent sessions (`npx relayhq skill install @relayhq/skill-code-review`)

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
- [ ] Phase 2 — Scheduled & recurring tasks, rate-limit auto-retry, model fallback
- [ ] Phase 3 — Task templates, comments/threads, real-time WebSocket board
- [ ] Phase 4 — Project docs + semantic search (Kioku), attachments as links
- [ ] Phase 5 — Notifications (Slack, webhooks), analytics dashboard, mobile board
- [ ] Phase 6 — Agent SDK, skill system, subtask spawning, shared context pool
- [ ] Phase 7 — Agent improvement loops (outcome feedback, quality signals)

See [docs/roadmap.md](docs/roadmap.md) for full feature breakdown and user flows.

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
