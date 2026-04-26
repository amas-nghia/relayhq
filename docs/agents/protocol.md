# Agent Protocol

This protocol tells any agent how to work with RelayHQ.

## Session start
1. Load the RelayHQ skill or project instructions.
2. Find tasks assigned to the agent or user.
3. Pick a task that is ready to start.

## Task selection rule
Only return tasks that are:
- assigned to the agent/user
- not blocked by dependencies
- not already done or cancelled

For the MVP, task selection must stay within a single user's registry scope and must not surface team-only or placeholder agents.

## Claiming a task
When the agent starts work, update the task:
- `status: in-progress`
- `execution_started_at: <timestamp>`
- `heartbeat_at: <timestamp>`

## During work
The agent should periodically update:
- `heartbeat_at`
- `progress`
- `execution_notes`

## Approval flow
If an action is risky:
- set `approval_needed: true`
- record `approval_reason`
- set `status: waiting-approval`
- stop until human approval is recorded

Approval-required actions must be visible in the agent registry and reflected in the task workflow.

Use `waiting-approval` only when the agent cannot continue without explicit human sign-off.

## Completion flow
When done, write:
- `status: review`
- `result`
- `completed_at`
- audit note or summary

Use `review` when implementation work is complete and the task is ready for human verification.

Only move a task to `done` after the human review step has finished.

Token reporting is optional but recommended when the runtime can provide it. Include any of:
- `tokens_used`
- `model`
- `cost_usd`

## Failure flow
If blocked or failed, write:
- `status: blocked` or `status: cancelled`
- `blocked_reason`
- `blocked_since`

## Stale detection
If `heartbeat_at` is too old, RelayHQ should mark the task as stale and surface it for recovery.

The minimal CLI talks to the same local HTTP write APIs as the UI. By default it uses `http://127.0.0.1:44210`, and agents can override that with `RELAYHQ_BASE_URL` or `--base-url=<url>`.

## CLI expectation
Any runtime agent should be able to call a CLI or writeback protocol such as:

```bash
bun run ./cli/relayhq.ts tasks --assignee=me
bun run ./cli/relayhq.ts claim task-001 --assignee=me
bun run ./cli/relayhq.ts heartbeat task-001 --assignee=me
bun run ./cli/relayhq.ts request-approval task-001 --assignee=me --reason="Need prod access"
bun run ./cli/relayhq.ts update task-001 --assignee=me --status=review --result="PR #42 created" --tokens-used=18420 --model="claude-sonnet-4-6" --cost-usd=0.11
```

## Design rule
Agents are responsible for reporting.
RelayHQ is responsible for coordination, visibility, and audit.
