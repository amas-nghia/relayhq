# Agent Protocol

How an agent interacts with RelayHQ during a session.

## Session start

When an agent session launches, RelayHQ injects a bootstrap pack via the context API. The agent should read this at the start of every session.

```bash
GET /api/agent/context
# Returns: task list, workspace context, matched skill files, agent config
```

Or use the MCP server — `relayhq_session_start(agentId="your-agent-id")` returns the same context.

## Task lifecycle

### 1. Claim

Before starting work, claim the task to prevent other agents from picking it up.

```bash
POST /api/vault/tasks/:id/claim
{ "actorId": "agent-my-dev" }
```

This sets `status: in-progress`, `execution_started_at`, and `heartbeat_at`. The task is now locked to this agent.

CLI:
```bash
bun run ./cli/relayhq.ts claim task-001 --assignee=agent-my-dev
```

### 2. Heartbeat (every ~10 minutes during work)

```bash
POST /api/vault/tasks/:id/heartbeat
{ "actorId": "agent-my-dev" }
```

Also PATCH `progress` and `execution_notes` to keep the board current:

```bash
curl -X PATCH http://localhost:44210/api/vault/tasks/task-001 \
  -H "Content-Type: application/json" \
  -d '{
    "actorId": "agent-my-dev",
    "patch": {
      "progress": 60,
      "execution_notes": "Auth module done, working on tests"
    }
  }'
```

CLI:
```bash
bun run ./cli/relayhq.ts heartbeat task-001 --assignee=agent-my-dev
```

### 3a. Complete (normal path)

```bash
curl -X PATCH http://localhost:44210/api/vault/tasks/task-001 \
  -H "Content-Type: application/json" \
  -d '{
    "actorId": "agent-my-dev",
    "patch": {
      "status": "review",
      "progress": 100,
      "result": "Implemented feature. Tests pass. PR #42."
    }
  }'
```

CLI:
```bash
bun run ./cli/relayhq.ts update task-001 \
  --assignee=agent-my-dev \
  --status=review \
  --result="Implemented feature. Tests pass. PR #42." \
  --tokens-used=18420 \
  --model="claude-sonnet-4-6" \
  --cost-usd=0.11
```

Use `review` (not `done`) — a human verifies before the task moves to `done`.

### 3b. Request approval (when action is risky)

```bash
POST /api/vault/tasks/:id/request-approval
{
  "actorId": "agent-my-dev",
  "reason": "About to delete 10,000 rows from the production database"
}
```

This sets `status: waiting-approval` and stops the agent. The human sees the approval request in the UI and either approves or rejects.

CLI:
```bash
bun run ./cli/relayhq.ts request-approval task-001 \
  --assignee=agent-my-dev \
  --reason="About to delete 10,000 rows"
```

### 3c. Blocked

If the agent cannot continue:

```bash
curl -X PATCH http://localhost:44210/api/vault/tasks/task-001 \
  -H "Content-Type: application/json" \
  -d '{
    "actorId": "agent-my-dev",
    "patch": {
      "status": "blocked",
      "blocked_reason": "Missing credentials for the staging database",
      "blocked_since": "2026-05-05T10:00:00Z"
    }
  }'
```

## Token and cost reporting

Include these optional fields in the final PATCH or CLI update. They feed into the analytics dashboard.

```bash
bun run ./cli/relayhq.ts update task-001 \
  --assignee=agent-my-dev \
  --status=review \
  --result="Done" \
  --tokens-used=25000 \
  --model="claude-sonnet-4-6" \
  --cost-usd=0.14
```

## Using the MCP server

If running inside Claude Code, the `relayhq-mcp` server exposes all the above as MCP tools:

```
relayhq_session_start    — load workspace context and task list
relayhq_claim_task       — claim a specific task
relayhq_heartbeat        — send heartbeat
relayhq_update_task      — update status/progress/result
relayhq_request_approval — request human sign-off
```

## Summary

| Step | Status | When |
|------|--------|------|
| Claim | `in-progress` | Before starting |
| Heartbeat | `in-progress` | Every ~10 min |
| Complete | `review` | Work done, needs human check |
| Approval needed | `waiting-approval` | Before risky action |
| Blocked | `blocked` | Cannot continue |
