<p align="center">
  <img src="docs/assets/logo.png" alt="RelayHQ" width="120" />
</p>

<h1 align="center">RelayHQ</h1>

<p align="center">
  <strong>Open-source task board for human + AI agent teams.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://github.com/amas-nghia/RelayHQ/stargazers"><img src="https://img.shields.io/github/stars/amas-nghia/RelayHQ?style=social" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/built%20with-Bun%20%2B%20React%20%2B%20Go-blueviolet" alt="Stack" />
  <img src="https://img.shields.io/badge/works%20with-Claude%20Code%20%C2%B7%20Cursor%20%C2%B7%20OpenCode-orange" alt="Runtimes" />
</p>

<p align="center">
  <a href="https://amas.gitbook.io/relayhq">Docs</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#connecting-your-agent">Connect Agent</a> ·
  <a href="#agent-workflow">Agent Workflow</a>
</p>

---

**RelayHQ is a local Kanban board where humans and AI agents share the same task queue.**

Humans create tasks. Agents claim them, work, and report back. Humans review and approve. Everything is Markdown files in a Git repo — no database, no cloud account, no lock-in.

```
Human creates task → Agent claims it → Agent works → Human reviews → Done
```

---

## Is RelayHQ right for you?

- You have Claude Code (or Cursor, OpenCode, Codex) doing real work and want to track what it's doing
- You run multiple AI agents on the same project and need them not to step on each other
- You want agents to ask for human approval before touching risky things (prod configs, migrations)
- You want a full audit log of everything agents did — in plain Markdown, committed to Git
- You think Jira is too heavy and Notion is too freeform for agent workflows

**Not the right fit if:** you want fully autonomous agents running without human oversight — look at [Paperclip](https://github.com/paperclipai/paperclip) instead.

---

## How it works

Every task is a Markdown file with YAML frontmatter:

```markdown
---
id: task-001
title: Implement login endpoint
status: in-progress
assignee: claude-code
priority: high
progress: 40
approval_needed: false
---

Implement JWT-based `/api/auth/login`.
Acceptance: returns 200 with token on valid credentials.
```

The API server reads and writes these files. The web UI shows the board. Agents interact via MCP tools or HTTP — same API, same files.

**RelayHQ coordinates work. It does not execute work.**

---

## Quick start

**Requires Node.js 18+**

```bash
npx relayhq init my-workspace
npx relayhq start my-workspace
```

Open [http://localhost:44211](http://localhost:44211) — a 3-step wizard walks you through connecting your first agent.

<details>
<summary>Contributing / running from source</summary>

```bash
git clone https://github.com/amas-nghia/RelayHQ.git
cd RelayHQ

# Terminal 1 — API server
cd app && bun install && bun run dev   # → http://localhost:44210

# Terminal 2 — Web UI
cd web && bun install && bun run dev   # → http://localhost:44211
```
</details>

---

## Connecting your agent

### Claude Code / Cursor / Antigravity

Add to `~/.claude/settings.json` (or equivalent):

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

> The onboarding wizard generates this snippet with your vault path pre-filled.

Restart your agent. You now have 5 tools available:

| Tool | When to call |
|------|-------------|
| `relayhq_inbox` | Start of every session — see what's assigned to you |
| `relayhq_start` | Claim a task and get full context |
| `relayhq_progress` | Every 5–10 min while working — update progress + heartbeat |
| `relayhq_done` | Work complete — moves task to review for human approval |
| `relayhq_blocked` | Can't continue — tells the human what needs resolving |

### OpenCode / Codex / any CLI agent

```bash
npx relayhq setup opencode   # creates .opencode/agents/relayhq.md
npx relayhq setup codex      # creates .codex/instructions/relayhq.md
```

The setup command writes a protocol instruction file that tells the agent how to call the HTTP API directly — no MCP required.

See [docs/connect.md](docs/connect.md) for all supported runtimes.

---

## Agent workflow

```
Session start:
  → relayhq_inbox(agentId)          check what's assigned to me

Claim and start:
  → relayhq_start(agentId, taskId)  claim task + get full context

While working (every 5–10 min):
  → relayhq_progress(agentId, taskId, percent, notes)

If stuck:
  → relayhq_blocked(agentId, taskId, reason)   stop and wait

When done:
  → relayhq_done(agentId, taskId, result)      → status: review
                                               human reviews next
```

Agents cannot move tasks to `done` themselves. Only humans can approve work as complete.

---

## Use cases

**Solo dev + Claude Code** — Maintain a task board in your project repo. Claude picks up tasks at session start, sends heartbeats, and asks before anything destructive.

**Multiple agents, one codebase** — Three Claude Code windows on the same repo. RelayHQ locks tasks so two agents can't claim the same one. The board shows who's doing what.

**Human-in-the-loop approval** — Agent finishes a database migration plan, calls `relayhq_done`. Human reviews in the UI, approves or sends back. Agent proceeds only after sign-off.

**Split thinking from doing** — Use Claude Opus to analyse and spec a problem. Hand off the tasks to a cheaper model to execute. The full context (objective, criteria, constraints) travels with the task — no re-explaining.

**Teams with async contributors** — Humans and agents work the same board. At standup the board shows what happened — written by humans and agents alike, all in Git.

---

## Why not Jira / Linear / Notion

| | RelayHQ | Jira / Linear | Notion |
|---|---|---|---|
| AI agents read & write natively | ✅ files + HTTP + MCP | ❌ custom integration | ❌ custom integration |
| Full audit trail in Git | ✅ | ❌ proprietary | ❌ proprietary |
| Works offline | ✅ | ❌ | ❌ |
| No cloud account needed | ✅ | ❌ | ❌ |
| Human approval gates for agents | ✅ built-in | ❌ | ❌ |
| Tasks are plain Markdown | ✅ edit anywhere | ❌ | ✅ but not Git-native |

---

## Features

**Available now**
- Kanban board — Todo → In Progress → Review → Done
- Task lifecycle API — claim, heartbeat, request-approval, complete
- Human approval gates — block agent progress until a human signs off
- Audit trail — every action writes a note, committed to Git
- Multi-agent locking — prevents two agents claiming the same task
- Agent registry — register agents with capabilities and task types
- MCP tools — 5 clean tools for Claude Code, Cursor, Antigravity
- Protocol pack installer — `npx relayhq setup <runtime>` for any agent
- Onboarding wizard — 3-step setup

**Coming next**
- Scheduled tasks — defer work; agents self-reschedule on rate limits
- Task templates — reusable shapes with pre-filled context
- Comments & threads — per-task discussion for humans and agents
- Real-time board — WebSocket push instead of polling

**Planned**
- Semantic search — vector search across tasks and project docs
- Notifications — Slack / webhook when tasks move or agents go stale
- Analytics — token cost, cycle time, throughput per agent
- Agent SDK — `@relayhq/agent-sdk` TypeScript package

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
  ┌────▼──────────────────────────────┐
  │  Agent runtimes                   │
  │  Claude Code · Cursor · OpenCode  │
  │  Codex · Antigravity · any HTTP   │
  └───────────────────────────────────┘
```

---

## Repository layout

```
RelayHQ/
├── app/      # Nuxt 3 API server (port 44210)
├── web/      # React + Vite board UI (port 44211)
├── backend/  # Go validation library (canonical schema types)
├── cli/      # Agent CLI (relayhq.ts)
├── scripts/  # relayhq.mjs (init/start), mcp-server.mjs (MCP tools)
├── vault/    # Demo vault — seeded tasks, approvals, agents
└── docs/     # Documentation
```

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

## Roadmap

- [x] Phase 1 — Core Kanban: tasks, boards, columns, assignment, approvals, audit
- [ ] Phase 2 — Scheduled & recurring tasks, rate-limit auto-retry
- [ ] Phase 3 — Task templates, comments/threads, real-time board
- [ ] Phase 4 — Project docs + semantic search (Kioku)
- [ ] Phase 5 — Notifications, analytics, mobile board
- [ ] Phase 6 — Agent SDK, skill system, subtask spawning

See [docs/roadmap.md](docs/roadmap.md) for full details.

---

## Contributing

Open an issue first to discuss what you'd like to change.

```bash
git checkout -b feature/my-feature
git commit -m "feat: my feature"
git push origin feature/my-feature
# open a pull request
```

---

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Built for teams where humans and AI agents work side by side.
</p>
