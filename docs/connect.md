# Connecting an AI Agent to RelayHQ

RelayHQ exposes its task board over a local HTTP API and an MCP server. Any AI coding tool that supports MCP can use the `relayhq_*` tools natively. Tools that don't support MCP can use the CLI or HTTP API directly.

**Two env vars are all you need:**

| Variable | Value |
|---|---|
| `RELAYHQ_BASE_URL` | `http://127.0.0.1:44210` |
| `RELAYHQ_VAULT_ROOT` | Path to your vault (e.g. `/home/user/my-vault`) |

The onboarding wizard (step 3) generates the correct snippet with your vault path pre-filled.

---

## Claude Code

Add to `~/.claude/settings.json` (one-time, applies to all sessions):

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

Restart Claude Code. You now have `relayhq_*` tools in every session:

```
relayhq_session_start    → task list + workspace context
relayhq_update_task      → report progress and move work to review
relayhq_heartbeat        → stay visible while working
relayhq_request_approval → ask a human before risky actions
```

**Recommended `CLAUDE.md` snippet** — add to any project that uses RelayHQ:

```markdown
## RelayHQ

At session start: `relayhq_session_start(agentId="claude-code")`
Heartbeat every ~10 min: `relayhq_heartbeat(taskId, agentId)`
When implementation is complete: `relayhq_update_task(taskId, agentId, status="review", result="...")`
```

---

## OpenCode

Add to `~/.config/opencode/config.json`:

```json
{
  "mcp": {
    "relayhq": {
      "type": "local",
      "command": ["npx", "relayhq-mcp"],
      "env": {
        "RELAYHQ_BASE_URL": "http://127.0.0.1:44210",
        "RELAYHQ_VAULT_ROOT": "/path/to/your/vault"
      }
    }
  }
}
```

Restart OpenCode. The same `relayhq_*` tools are available via the MCP protocol.

---

## Codex CLI

Add to `~/.codex/config.yaml`:

```yaml
mcpServers:
  relayhq:
    command: npx
    args:
      - relayhq-mcp
    env:
      RELAYHQ_BASE_URL: "http://127.0.0.1:44210"
      RELAYHQ_VAULT_ROOT: "/path/to/your/vault"
```

---

## Any tool — CLI / shell

If your tool doesn't support MCP, export the vars into your shell profile and use the RelayHQ CLI directly:

```sh
# Add to ~/.zshrc or ~/.bashrc
export RELAYHQ_BASE_URL="http://127.0.0.1:44210"
export RELAYHQ_VAULT_ROOT="/path/to/your/vault"
```

Then use the CLI from any terminal:

```bash
bun run ./cli/relayhq.ts tasks --assignee=my-agent
bun run ./cli/relayhq.ts claim task-001 --assignee=my-agent
bun run ./cli/relayhq.ts heartbeat task-001 --assignee=my-agent
bun run ./cli/relayhq.ts update task-001 --assignee=my-agent --status=review --result="PR #42 opened."
```

Or call the HTTP API directly — no CLI required:

```bash
curl -X POST http://127.0.0.1:44210/api/vault/tasks/task-001/claim \
  -H "content-type: application/json" \
  -d '{"assignee":"my-agent"}'
```

---

## Verification

After setup, confirm the connection:

```bash
curl http://127.0.0.1:44210/api/health
```

Expected: `{"status":"ok"}` (or similar). If the server isn't running, start it first — see [Quick Start](../README.md#quick-start).
