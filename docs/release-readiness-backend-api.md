# Backend API Release Readiness

## Status

- Verification date: 2026-05-05
- Backend tests: `bun test` passes with 374 passing tests
- Typecheck: `bun run typecheck` passes
- Contract validation: included in the green `bun test` run via `server/api/contract-alignment.test.ts`
- Current release blocker: route coverage is still incomplete

## Coverage Delta In This Pass

- Newly added tests: 4
- New route coverage added:
  - `app/server/api/kioku/graph.get.test.ts`
  - edge test in `app/server/api/agent/install.test.ts`
  - edge test in `app/server/api/settings/snippets.get.test.ts`
- Net suite growth: 370 passing tests before this pass to 374 passing tests after this pass

## Blocking Failures Found And Resolved

- Typecheck was blocked by schema coercion assertions in migration/reset scripts.
- Typecheck was blocked by route query parsing helpers that did not accept the full `h3` query value surface.
- Typecheck was blocked by stale test fixtures after `ReadModelTask`, `ReadModelAgent`, `ReadModelProject`, and `VaultReadModel` shape expansions.
- Typecheck was blocked by schedule lifecycle calls passing unsupported `reason` properties.
- Typecheck was blocked by test-only fetch/mock typing issues and MCP response narrowing.
- Runtime-facing bug fixed: `launch.ts` was reading `agent.api_key_ref` instead of `agent.apiKeyRef`.

## Inventory Method

- Inventory source: every route file under `app/server/api/**/*.ts`, excluding `*.test.ts`
- Coverage status: conservative direct route-import coverage from colocated or route-specific tests
- Important: this undercounts some indirect coverage, so uncovered counts should be treated as a lower-confidence floor for additional work, not as proof that a route is totally unexercised

## Totals

- Total backend API routes: 94
- Routes with direct automated coverage: 43
- Conservatively uncovered routes: 51

## Phased Plan

### Phase 1

- Owner: backend/control-plane
- Goal: close the highest-risk task and agent execution gaps while keeping the suite green
- Target areas:
  - `agent/[id]/resume.post.ts`
  - `agent/dispatch/[taskId].get.ts`
  - `agent/tasks.get.ts`
  - `agent/sessions/[sessionId].delete.ts`
  - `agent/sessions/[sessionId]/events.get.ts`
  - `agent/sessions/[sessionId]/usage.get.ts`
  - `vault/tasks/[id]/claim.ts`
  - `vault/tasks/[id]/heartbeat.ts`
  - `vault/tasks/[id]/request-approval.ts`
  - `vault/tasks/[id]/approve.ts`
  - `vault/tasks/[id]/reject.ts`
  - `vault/tasks/[id]/comments.ts`
  - `vault/tasks/[id]/promote.ts`

### Phase 2

- Owner: backend/platform
- Goal: harden read surfaces and operator settings endpoints
- Target areas:
  - `vault/documents.get.ts`
  - `vault/documents.post.ts`
  - `vault/task-templates.get.ts`
  - `vault/task-templates/[id].ts`
  - `vault/projects.post.ts`
  - `vault/projects/[id]/coordinator-thread.get.ts`
  - `vault/projects/[id]/coordinator-thread.post.ts`
  - `vault/projects/[id]/index-status.get.ts`
  - `vault/projects/[id]/index/index.post.ts`
  - `settings/api-keys.get.ts`
  - `settings/skills.get.ts`
  - `settings/vault-files.get.ts`
  - `settings/webhooks.get.ts`
  - `settings/webhooks.post.ts`
  - `settings/webhooks/test.post.ts`
  - `kioku/search.post.ts`

### Phase 3

- Owner: integrations/platform
- Goal: cover low-frequency but ship-critical utility and auth surfaces
- Target areas:
  - `analytics/*.get.ts`
  - `auth/openai/*.ts`
  - `auth/openrouter/*.ts`
  - `health.get.ts`
  - `openapi.json.ts`
  - `scalar.get.ts`
  - `realtime/stream.get.ts`
  - `runners/available-clis.get.ts`
  - `agent/[id]/activity.get.ts`
  - `agent/cost-summary.get.ts`

## Full Inventory

### Agent

- Tested: `agent/[id]/run.post.ts`, `agent/[id]/sessions.get.ts`, `agent/active.get.ts`, `agent/bootstrap/[taskId].get.ts`, `agent/context.get.ts`, `agent/help.get.ts`, `agent/install.get.ts`, `agent/planner-context.get.ts`, `agent/search-code.get.ts`, `agent/search-docs.post.ts`, `agent/search.post.ts`, `agent/session.get.ts`, `agent/sessions/[sessionId]/messages.post.ts`, `agent/state.get.ts`, `agent/tasks.post.ts`, `agent/tasks/claim-next.post.ts`
- Untested: `agent/[id]/activity.get.ts`, `agent/[id]/resume.post.ts`, `agent/cost-summary.get.ts`, `agent/dispatch/[taskId].get.ts`, `agent/sessions/[sessionId].delete.ts`, `agent/sessions/[sessionId]/events.get.ts`, `agent/sessions/[sessionId]/usage.get.ts`, `agent/tasks.get.ts`

### Analytics

- Tested: none
- Untested: `analytics/agents.get.ts`, `analytics/cost.get.ts`, `analytics/providers.get.ts`, `analytics/summary.get.ts`, `analytics/velocity.get.ts`

### Auth

- Tested: none
- Untested: `auth/openai/result.get.ts`, `auth/openai/start.get.ts`, `auth/openrouter/callback.get.ts`, `auth/openrouter/result.get.ts`, `auth/openrouter/start.get.ts`

### Health

- Tested: none
- Untested: `health.get.ts`

### Kioku

- Tested: `kioku/graph.get.ts`
- Untested: `kioku/search.post.ts`

### Metrics

- Tested: `metrics/token-savings.get.ts`
- Untested: none

### OpenAPI

- Tested: none
- Untested: `openapi.json.ts`

### Realtime

- Tested: none
- Untested: `realtime/stream.get.ts`

### Runners

- Tested: none
- Untested: `runners/available-clis.get.ts`

### Scalar

- Tested: none
- Untested: `scalar.get.ts`

### Settings

- Tested: `settings/browse.get.ts`, `settings/register-agents.post.ts`, `settings/scan-agents.get.ts`, `settings/shell-profile.post.ts`, `settings/snippets.get.ts`, `settings/validate.post.ts`, `settings/verify-key.post.ts`, `settings.get.ts`, `settings.post.ts`
- Untested: `settings/api-keys.get.ts`, `settings/skills.get.ts`, `settings/snippets.ts`, `settings/vault-files.get.ts`, `settings/webhooks.get.ts`, `settings/webhooks.post.ts`, `settings/webhooks/test.post.ts`

### Vault

- Tested: `vault/agents.post.ts`, `vault/agents/[id].patch.ts`, `vault/agents/[id]/bind-runtime.post.ts`, `vault/audit-notes.get.ts`, `vault/docs/[id].patch.ts`, `vault/docs/index.get.ts`, `vault/docs/index.post.ts`, `vault/init.post.ts`, `vault/projects/[id].ts`, `vault/projects/[id]/coordinator-chat.post.ts`, `vault/read-model.get.ts`, `vault/task-templates.post.ts`, `vault/tasks.post.ts`, `vault/tasks/[id].ts`, `vault/tasks/[id]/schedule.post.ts`, `vault/tasks/[id]/spawn-subtask.ts`
- Untested: `vault/agents/[id].delete.ts`, `vault/agents/[id]/runtime-readiness.get.ts`, `vault/assets/agent-avatar.post.ts`, `vault/docs/[id].get.ts`, `vault/documents.get.ts`, `vault/documents.post.ts`, `vault/projects.post.ts`, `vault/projects/[id]/coordinator-thread.get.ts`, `vault/projects/[id]/coordinator-thread.post.ts`, `vault/projects/[id]/index-status.get.ts`, `vault/projects/[id]/index/index.post.ts`, `vault/task-templates.get.ts`, `vault/task-templates/[id].ts`, `vault/tasks/[id]/approve.ts`, `vault/tasks/[id]/claim.ts`, `vault/tasks/[id]/comments.ts`, `vault/tasks/[id]/heartbeat.ts`, `vault/tasks/[id]/promote.ts`, `vault/tasks/[id]/reject.ts`, `vault/tasks/[id]/request-approval.ts`

## Remaining Release Blockers

- 51 routes remain conservatively uncovered by route-specific automated tests.
- The highest-risk remaining gaps are task lifecycle mutation endpoints, session lifecycle endpoints, analytics read-model endpoints, and auth callback/start endpoints.
- There are no active backend test, typecheck, or contract blockers after this pass.

## Recommended Next Batch

- Add route-level tests for `vault/tasks/[id]/claim.ts`, `vault/tasks/[id]/heartbeat.ts`, and `vault/tasks/[id]/request-approval.ts`.
- Add session lifecycle tests for `agent/[id]/resume.post.ts`, `agent/sessions/[sessionId]/usage.get.ts`, and `agent/sessions/[sessionId].delete.ts`.
- Add smoke coverage for `analytics/summary.get.ts` and `analytics/cost.get.ts` before sign-off.
