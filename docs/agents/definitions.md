# Agent Definitions

Agents are registered as Markdown files in `vault/shared/agents/`. RelayHQ reads these at startup and uses them to route tasks, enforce policy, and launch sessions.

## Minimal agent file

`vault/shared/agents/agent-my-dev.md`

```yaml
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
```

## Key fields

### `role`

- `coordinator` — project-level planning agent, cannot be assigned normal worker tasks
- `worker` (default) — takes and executes tasks from the board

### `provider` and `model`

Supported providers: `anthropic`, `openai`, `google`, `openrouter`

The model must match the provider. See `app/shared/vault/schema.ts` for `ALLOWED_MODELS`.

### `api_key_ref`

Per-agent API key. This overrides the server's default key for this agent's sessions.

```yaml
api_key_ref: env:MY_CUSTOM_ANTHROPIC_KEY
```

The value must use a `env:`, `secret:`, or `vault:` prefix — never a raw key. The `env:` prefix reads from the server process environment at launch time.

If omitted, the server's default key for the provider is used.

### `task_types_accepted` and `capabilities`

These are matched against task `tags` by the auto-dispatcher. An agent is only assigned a task if at least one of its `task_types_accepted` or `capabilities` matches at least one of the task's `tags`.

**Tasks with no tags are never auto-dispatched.** Tags are required when creating tasks.

```yaml
task_types_accepted:
  - feature-implementation
  - bug-fix
capabilities:
  - write-typescript
  - write-react
```

A task tagged `["bug-fix", "frontend"]` would match this agent via `bug-fix` (from `task_types_accepted`).

### `approval_required_for`

Actions that must go through human approval before the agent can proceed.

```yaml
approval_required_for:
  - database-schema-change
  - deploy-to-production
```

### `status`

- `available` — the agent can be assigned tasks
- `paused` — the agent will not be dispatched
- `offline` — the agent is not reachable

### `skill_file`

Path to a skill Markdown file that is injected into the agent's context at session start. Relative to `~/.relayhq/skills/` or absolute.

```yaml
skill_file: skills/my-skill.md
```

## Coordinator agent

A coordinator handles project-level planning. It can create and assign worker tasks, run coordinator chat, and manage project direction. It cannot be assigned normal board tasks.

```yaml
---
id: agent-coordinator
type: agent
name: Project Coordinator
role: coordinator
roles: [coordinator]
provider: anthropic
model: claude-opus-4-7
capabilities: []
task_types_accepted: []
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
```

## Multiple API keys

Different agents can use different provider accounts. This lets you run parallel sessions across multiple API keys.

```yaml
# Agent using a team key
api_key_ref: env:TEAM_ANTHROPIC_KEY

# Agent using a personal key
api_key_ref: env:PERSONAL_ANTHROPIC_KEY
```

Set both env vars on the server and the dispatcher injects the right key for each agent at launch time.

## Updating an agent

```bash
curl -X PATCH http://localhost:44210/api/vault/agents/agent-my-dev \
  -H "Content-Type: application/json" \
  -d '{
    "actorId": "human-user",
    "patch": {
      "model": "claude-opus-4-7",
      "status": "paused"
    }
  }'
```

Or edit the file directly in `vault/shared/agents/` — the read model reloads on next request.
