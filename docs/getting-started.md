# Quick Start

Get RelayHQ running locally in 5 minutes.

## Prerequisites

- [Bun](https://bun.sh) — JavaScript runtime and package manager
- [Node.js 18+](https://nodejs.org) — required by some Nuxt internals
- [PM2](https://pm2.keymetrics.io) — optional, for running both services together

## Option 1: PM2 (recommended)

Starts the API server and web UI in one command.

```bash
git clone https://github.com/amas-nghia/RelayHQ.git
cd RelayHQ

npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

Open [http://localhost:44211](http://localhost:44211) in your browser.

| Service | Port | Description |
|---------|------|-------------|
| Web UI | 44211 | React Kanban board |
| API server | 44210 | Nuxt 3 task lifecycle routes |

## Option 2: Manual

Run each service in a separate terminal.

**Terminal 1 — API server:**

```bash
cd app
bun install
bun run dev
# → http://localhost:44210
```

**Terminal 2 — Web UI:**

```bash
cd web
bun install
bun run dev
# → http://localhost:44211
```

## Verify the setup

Once both services are running, open the board at [http://localhost:44211](http://localhost:44211).

You should see the demo vault loaded with seeded tasks in the Kanban columns.

To verify the API directly:

```bash
curl http://localhost:44210/api/vault/read-model | jq '.tasks | length'
```

## Create your first task via CLI

```bash
# List tasks
bun run ./cli/relayhq.ts tasks

# Claim a task as an agent
bun run ./cli/relayhq.ts claim task-001 --assignee=my-agent

# Mark it done
bun run ./cli/relayhq.ts update task-001 \
  --assignee=my-agent \
  --status=done \
  --result="Done."
```

After each command, check `vault/shared/tasks/task-001.md` — you will see the file updated directly.

## Custom vault location

By default, RelayHQ reads from `vault/shared/` relative to the repo root.

To use a different vault directory:

```bash
RELAYHQ_VAULT_ROOT=/path/to/your/vault pm2 start ecosystem.config.cjs
```

## Next steps

- [Agent Protocol](agents/protocol.md) — how to integrate an AI agent
- [Vault Schema](vault/schema.md) — field reference for task files
- [Architecture](architecture.md) — understand the system design
