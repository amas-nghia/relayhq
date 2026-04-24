# Harness Workstreams Context

Session: 2026-04-19-harness-workstreams
Repo: /home/amas/Documents/GitHub/RelayHQ-vault-first

## Objective

Complete these 4 workstreams end-to-end:
- `.tmp/tasks/harness-context-bootstrap`
- `.tmp/tasks/harness-task-planner`
- `.tmp/tasks/harness-prompts`
- `.tmp/tasks/harness-mcp-server`

RelayHQ remains the control plane. UI is optional. We are building the headless harness that lets planner and executor runtimes work through RelayHQ.

## Wave Order

### Wave 1
- harness-context-bootstrap-01
- harness-context-bootstrap-02
- harness-task-planner-01
- harness-task-planner-02
- harness-prompts-01
- harness-prompts-02

### Wave 2
- harness-context-bootstrap-03 (after context-bootstrap 01+02)
- harness-task-planner-03 (after task-planner 01+02)
- harness-prompts-03 (after prompts 01+02)

### Wave 3
- QA and bug-fix pass for context-bootstrap + task-planner + prompts

### Wave 4
- harness-mcp-server-01 (after context-bootstrap + task-planner are complete)

### Wave 5
- harness-mcp-server-02 (after mcp-server-01)

### Wave 6
- harness-mcp-server-03 (after mcp-server-01 + 02)

### Wave 7
- Full verification, bug-fix pass, close all task trees

## Shared Rules

- Do not bypass RelayHQ lock/approval/task lifecycle semantics.
- Do not write raw vault files directly from planner/executor interfaces unless the specific task explicitly requires canonical API/service work.
- No raw vault body leakage in agent-facing responses.
- Keep CLI and HTTP behavior aligned.
- Keep planner lane and executor lane separated.

## Anti-Stuck Rule

- If a subagent stalls, aborts, or returns no usable result within ~30 seconds, stop waiting.
- Fall back to direct implementation or another tool path immediately.
- Do not block the full workflow on a single stuck subagent.

## Key Reference Files

- `docs/relayhq-agent-harness-plan.md`
- `docs/agents/protocol.md`
- `cli/relayhq.ts`
- `app/server/api/vault/read-model.get.ts`
- `app/server/api/vault/tasks/[id].ts`
- `app/server/api/vault/tasks.post.ts`
- `app/server/api/kioku/search.post.ts`
- `app/server/models/read-model.ts`
- `app/server/services/vault/read.ts`
- `app/server/services/vault/runtime.ts`

## Verification Commands

Focused tests should be run per subtask when possible.

Final verification must include:

```bash
cd app
bun run lint
bun test
bun run build
```

If MCP server is added, also verify that it starts and exposes the expected tool list.

## Completion Requirement

When a workstream is truly done:
- update each subtask JSON with completed state + completion summary
- update workstream `task.json` with completed count and completed_at
- if issues are found and fixed, record them in an `issues.md` for that workstream if useful
