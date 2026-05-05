<p align="center">
  <img src="docs/assets/logo.png" alt="RelayHQ" width="100%" />
</p>

<h1 align="center">RelayHQ</h1>

<p align="center">
  <strong>Open-source coordination layer for human + AI agent teams.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://github.com/amas-nghia/RelayHQ/stargazers"><img src="https://img.shields.io/github/stars/amas-nghia/RelayHQ?style=social" alt="Stars" /></a>
  <img src="https://img.shields.io/badge/works%20with-Claude%20Code%20%C2%B7%20Cursor%20%C2%B7%20OpenCode-orange" alt="Runtimes" />
</p>

<p align="center">
  <a href="https://amas.gitbook.io/relayhq">Docs</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#connecting-your-agent">Connect Agent</a>
</p>

---

<p align="center">
  <a href="https://www.loom.com/share/496c1d58c33a435f826ad8f620191eab">
    <img src="docs/assets/demo.gif" alt="Watch the RelayHQ demo" width="720" />
  </a>
</p>

---

AI agents can write code, run tests, and ship features — but they still need someone to decide *what* to work on, in *what order*, and to say *yes* before anything goes to production.

RelayHQ is the coordination layer that sits between you and your agents. It decides which agent gets which task, prevents two agents from claiming the same work, routes by capability, holds approval gates, and keeps a full audit trail — all in plain Markdown files committed to your Git repo.

You don't manage agents directly. You manage the task queue. RelayHQ handles the rest.

```
You create task + define acceptance criteria + assign to agent (or leave for pool)
       ↓
RelayHQ routes to the right agent — locks it so no other agent can claim
       ↓
Agent works → sends heartbeats → RelayHQ auto-reclaims if agent goes silent
       ↓
Needs sign-off? → agent pauses and waits — nothing proceeds without approval
       ↓
You review in the UI → approve or send back with notes
       ↓
Done. Written to vault. Committed to Git. Full audit trail.
```

Works with Claude Code, Cursor, OpenCode, Codex, Antigravity — or any agent that can call an HTTP API.

---

## Is RelayHQ right for you?

- You use Claude Code (or Cursor, OpenCode, Codex) for real work and want to track what it's doing
- You run multiple AI agents on the same project and need them not to step on each other
- You want agents to ask for human approval before touching risky things (migrations, prod configs)
- You want a full audit log of everything agents did — in plain Markdown, committed to Git

**Not the right fit if:** you want fully autonomous agents with no human oversight.

---

## How it works

Every task is a Markdown file:

```markdown
---
id: task-001
title: Implement login endpoint
status: in-progress
assignee: claude-code
priority: high
progress: 40
---

Implement JWT-based `/api/auth/login`.
Acceptance: returns 200 with token on valid credentials.
```

The API server reads and writes these files. The web UI shows the board. Agents interact via MCP tools or HTTP — same API, same files.

**RelayHQ coordinates work. It does not execute work.**

---

## Quick start

**Requires [Bun](https://bun.sh) and [PM2](https://pm2.keymetrics.io)**

```bash
git clone https://github.com/amas-nghia/relayhq.git
cd relayhq
pm2 start ecosystem.config.cjs
```

Open [http://localhost:44211](http://localhost:44211) — a 3-step wizard walks you through vault setup and agent connection.

<details>
<summary>Running from source</summary>

```bash
git clone https://github.com/amas-nghia/RelayHQ.git
cd RelayHQ

cd app && bun install && bun run dev   # API server → http://localhost:44210
cd web && bun install && bun run dev   # Web UI    → http://localhost:44211
```
</details>

---

## Connecting your agent

### Claude Code / Cursor / Antigravity (MCP)

**Step 1** — Add to `~/.claude/settings.json` (or equivalent):

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

**Step 2** — Install the protocol skill into your project:

```bash
npx relayhq setup claude-code   # appends to CLAUDE.md
npx relayhq setup cursor        # writes .cursor/rules/relayhq.mdc
npx relayhq setup antigravity   # writes .antigravity/instructions/relayhq.md
```

The skill file tells the agent exactly how to behave: claim before starting, send heartbeats every 5–10 min, move to "review" when done — never "done" directly. Without it the agent has the tools but no rules for using them correctly.

Restart your agent. Six tools are now available: `relayhq_inbox`, `relayhq_start`, `relayhq_progress`, `relayhq_request_approval`, `relayhq_done`, `relayhq_blocked`.

### OpenCode / Codex / any CLI agent

```bash
npx relayhq setup opencode   # creates .opencode/agents/relayhq.md
npx relayhq setup codex      # creates .codex/instructions/relayhq.md
```

The setup command writes the full protocol as an instruction file — HTTP API endpoints, request shapes, and the same behavioral rules (heartbeat cadence, review-not-done, approval gates).

See [docs/connect.md](docs/connect.md) for all supported runtimes.

Background auto-dispatch is disabled by default. Set `RELAYHQ_DISABLE_AUTO_DISPATCH=false` if you explicitly want RelayHQ to poll assigned or scheduled tasks and spawn agent sessions automatically.

---

## Agent workflow

```
Session start  →  relayhq_inbox          check what's assigned to me
Claim task     →  relayhq_start          get full context (objective, criteria, files)
While working  →  relayhq_progress       update % + heartbeat every 5–10 min
Need approval  →  relayhq_request_approval pause for a human decision
If stuck       →  relayhq_blocked        stop and tell the human what's missing
When done      →  relayhq_done           moves to "review" — human approves next
```

Agents cannot move tasks to `done` themselves. Only humans approve.

---

## Architecture

```
┌──────────────────────────────────────┐
│           Vault (Git repo)           │
│  vault/shared/tasks/                 │
│  vault/shared/approvals/             │
│  vault/shared/audit/                 │
│  vault/shared/agents/                │
└──────────────┬───────────────────────┘
               │ read / write markdown files
       ┌───────┴────────┐
       │                │
  ┌────▼────┐     ┌─────▼──────────┐
  │  API    │     │  React Web UI  │
  │ Nuxt 3  │◄───►│  (port 44211)  │
  │ :44210  │     └────────────────┘
  └────┬────┘
       │
  ┌────▼──────────────────────────────┐
  │  Agent runtimes                   │
  │  Claude Code · Cursor · OpenCode  │
  │  Codex · Antigravity · any HTTP   │
  └───────────────────────────────────┘
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

## Contributing

Open an issue first to discuss what you'd like to change.

```bash
git checkout -b feature/my-feature
git commit -m "feat: my feature"
git push origin feature/my-feature
```

See [docs/roadmap.md](docs/roadmap.md) for what's planned.

---

## License

MIT — see [LICENSE](LICENSE).
