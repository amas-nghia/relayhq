# Dogfooding Verification

Date: 2026-04-16

## What Was Verified
- RelayHQ dev board is served from the app at `http://localhost:4310`
- `project-relayhq-dev` and `board-dev-sprint` are present in the canonical read model
- `kioku-01-http-contract` is already in progress and visible on the dev board
- `kioku-02-sqlite-storage` can be claimed and heartbeated through the CLI
- The demo board data remains intact

## Commands Run
- `bun run ./cli/relayhq.ts tasks --base-url=http://localhost:4310 --assignee=agent-claude-code`
- `bun run ./cli/relayhq.ts claim kioku-02-sqlite-storage --base-url=http://localhost:4310 --assignee=agent-claude-code`
- `bun run ./cli/relayhq.ts heartbeat kioku-02-sqlite-storage --base-url=http://localhost:4310 --assignee=agent-claude-code`
- `bun run ./cli/relayhq.ts tasks --base-url=http://localhost:4310 --assignee=agent-claude-code`
- `GET /api/vault/read-model` via `http://localhost:4310/api/vault/read-model`

## Evidence
- `GET /` => 200
- `GET /boards/board-dev-sprint` => 200
- `GET /tasks/kioku-01-http-contract` => 200
- `kioku-02-sqlite-storage` updated to `in-progress` with `locked_by: agent-claude-code`
- Heartbeat updated `kioku-02-sqlite-storage` lock expiry and heartbeat timestamp

## Notes
- The first heartbeat attempt returned a lock error during a race, but a second retry succeeded.
- The required task-management router script is still missing, so task JSON status updates were maintained manually.
