<p align="center">
  <img src="docs/assets/logo.png" alt="RelayHQ" width="120" />
</p>

<h1 align="center">RelayHQ</h1>

<p align="center">
  <strong>Open-source task board for human + AI agent teams.</strong><br/>
  Humans create tasks. Agents claim, work, and report back. Humans review and approve.<br/>
  Everything is Markdown files in a Git repo — no database, no cloud account, no lock-in.
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

## Quick start

**Requires Node.js 18+**

```bash
npx relayhq init my-workspace
npx relayhq start my-workspace
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

Restart your agent. Five tools are now available: `relayhq_inbox`, `relayhq_start`, `relayhq_progress`, `relayhq_done`, `relayhq_blocked`.

### OpenCode / Codex / any CLI agent

```bash
npx relayhq setup opencode   # creates .opencode/agents/relayhq.md
npx relayhq setup codex      # creates .codex/instructions/relayhq.md
```

See [docs/connect.md](docs/connect.md) for all supported runtimes.

---

## Agent workflow

```
Session start  →  relayhq_inbox          check what's assigned to me
Claim task     →  relayhq_start          get full context (objective, criteria, files)
While working  →  relayhq_progress       update % + heartbeat every 5–10 min
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
