# Clients

RelayHQ is a shared control plane. MCP is one adapter, not the only one.

All clients should hit the same backend on `http://127.0.0.1:4310` so they share the same vault state, task locks, approvals, and bootstrap context.

## Adapter Options

- MCP: best for clients that support tool loading directly
- HTTP: direct API access for scripts, editors, and non-MCP runtimes
- CLI: thin wrapper over the same local HTTP APIs

## MCP

- Repo-local config lives in `.mcp.json`
- Server command is `bun run mcp/server.ts`
- Supported in MCP-capable clients such as Claude Code and OpenCode
- Verify tools load by checking for RelayHQ tools like `relayhq_get_context`, `relayhq_get_bootstrap`, and `relayhq_search_code`
- RelayHQ itself must already be running before the MCP adapter can proxy requests successfully

## HTTP

- Base URL: `http://127.0.0.1:4310`
- Content type: `application/json`
- Local development auth: none
- Useful endpoints:
  - `GET /api/health`
  - `GET /api/vault/read-model`
  - `GET /api/agent/context`
  - `GET /api/agent/planner-context`
  - `GET /api/agent/bootstrap/:taskId`
  - `GET /api/agent/search-code?q=<query>`
  - `POST /api/agent/tasks/claim-next`
  - `POST /api/vault/tasks/:id/claim`
  - `POST /api/vault/tasks/:id/heartbeat`
  - `PATCH /api/vault/tasks/:id`

## CLI

- Entry point: `bun run ./cli/relayhq.ts`
- Default base URL: `http://127.0.0.1:4310`
- Override with `RELAYHQ_BASE_URL` or `--base-url=<url>`
- Common commands:
  - `relayhq context`
  - `relayhq bootstrap <task-id>`
  - `relayhq search-context <query>`
  - `relayhq index <path> [--vault-root=<path>]`
  - `relayhq tasks --assignee=<agent-id>`
  - `relayhq claim <task-id> --assignee=<agent-id>`
  - `relayhq heartbeat <task-id> --assignee=<agent-id>`
  - `relayhq update <task-id> --assignee=<agent-id> --status=<status>`

## Shared State Model

- All adapters read and write the same canonical vault state
- Lock state and approval state are shared because they flow through the same RelayHQ APIs
- Bootstrap and planner context are shared because they are derived from the same read-model

## Verification Note

- MCP, HTTP, and CLI all proxy into the same local backend and therefore the same vault root
- Practical verification:
  - HTTP `GET /api/agent/context` returns the same project/task state surfaced by the UI
  - CLI `relayhq context` and `relayhq bootstrap <task-id>` resolve through the same backend
  - MCP tools call the same endpoints via `mcp/server.ts`
