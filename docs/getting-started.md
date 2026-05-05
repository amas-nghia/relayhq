# Getting Started

## Prerequisites

- [Bun](https://bun.sh) — runtime for the API server
- [Node.js 18+](https://nodejs.org) — required by the web UI build
- [PM2](https://pm2.keymetrics.io) — optional, runs both services together

## Run with PM2 (recommended)

```bash
npm install -g pm2

# From the repo root:
pm2 start ecosystem.config.cjs
pm2 save
```

Open [http://localhost:44211](http://localhost:44211). You land directly in the OS shell — the Kanban board.

## Run manually

**Terminal 1 — API server:**
```bash
cd app
bun install
bun run dev
# Listening on http://localhost:44210
```

**Terminal 2 — Web UI:**
```bash
cd web
npm install
npm run dev
# Listening on http://localhost:44211
```

## Vault location

By default RelayHQ reads from `vault/shared/` relative to the repo root.

To use an external vault (e.g. an Obsidian vault):
```bash
RELAYHQ_VAULT_ROOT=/path/to/your/vault pm2 start ecosystem.config.cjs
# or
RELAYHQ_VAULT_ROOT=/path/to/your/vault bun run dev
```

After restart, the API reads all task, agent, project, and board files from the new path.

## Verify the setup

```bash
curl http://localhost:44210/api/health
# → {"status":"ok","vaultRoot":"/path/to/vault"}

curl http://localhost:44210/api/vault/read-model | jq '.tasks | length'
# → number of tasks in the vault
```

## Create your first task

Tasks require tags so the auto-dispatcher can route them to the right agent.

```bash
curl -X POST http://localhost:44210/api/vault/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My first task",
    "projectId": "project-demo",
    "boardId": "board-demo",
    "columnId": "todo",
    "priority": "medium",
    "tags": ["feature-implementation"],
    "objective": "Describe what needs to be done and why in at least 50 characters.",
    "acceptanceCriteria": ["Criterion one", "Criterion two"],
    "contextFiles": ["path/to/relevant/file.ts"]
  }'
```

## Register an agent

Create a file in `vault/shared/agents/`:

```bash
cat > vault/shared/agents/agent-my-dev.md << 'EOF'
---
id: agent-my-dev
type: agent
name: My Dev Agent
role: worker
provider: anthropic
model: claude-sonnet-4-6
capabilities:
  - write-code
  - write-tests
task_types_accepted:
  - feature-implementation
  - bug-fix
approval_required_for: []
cannot_do: []
accessible_by: []
skill_file: null
status: available
workspace_id: ws-my-workspace
api_key_ref: env:ANTHROPIC_API_KEY
created_at: 2026-01-01T00:00:00Z
updated_at: 2026-01-01T00:00:00Z
---
EOF
```

The agent's `task_types_accepted` and `capabilities` fields must overlap with task `tags` for the auto-dispatcher to assign work to it.

## Use the CLI

```bash
# List tasks
bun run ./cli/relayhq.ts tasks

# Claim a task as an agent
bun run ./cli/relayhq.ts claim task-001 --assignee=agent-my-dev

# Send a heartbeat during work
bun run ./cli/relayhq.ts heartbeat task-001 --assignee=agent-my-dev

# Request human approval
bun run ./cli/relayhq.ts request-approval task-001 \
  --assignee=agent-my-dev \
  --reason="Need sign-off before deleting data"

# Mark complete
bun run ./cli/relayhq.ts update task-001 \
  --assignee=agent-my-dev \
  --status=review \
  --result="Implemented. PR #42."
```

Default base URL is `http://127.0.0.1:44210`. Override with `RELAYHQ_BASE_URL` or `--base-url`.

## Next steps

- [Architecture](architecture.md) — understand how the pieces fit together
- [Agent Definitions](agents/definitions.md) — configure agents with API keys, skills, and capabilities
- [Agent Protocol](agents/protocol.md) — how agents interact with RelayHQ during a session
- [Vault Schema](vault/schema.md) — full field reference for vault files
