---
id: ws-my-workspace
type: workspace
name: My Workspace
owner_ids: ["@relayhq-web"]
member_ids: ["@relayhq-web", "agent-claude-code"]
created_at: 2026-04-23T00:00:00Z
updated_at: 2026-04-23T00:00:00Z
---

# My Workspace

Verified workspace brief for the current `RelayHQ-vault-first` repository snapshot.

This file is intentionally repo-specific.

Every placement rule below was checked against files that exist now.

Use it as the first orientation document before opening code.

If this brief and a source file disagree, trust the source file.

## What this workspace is

- RelayHQ is a vault-first coordination plane.
- The product coordinates work across humans and agents.
- The product does not execute work itself.
- Canonical shared state lives in Markdown files under `vault/shared/**`.
- The Nuxt app in `app/` reads and writes that canonical state.
- The Go package in `backend/internal/vault/` holds canonical validation types and helpers.
- The CLI in `cli/` talks to the same local HTTP APIs as the UI.
- The repo currently contains seeded demo data under `vault/shared/**`.

## Fast reading order for a fresh agent

- Read `CLAUDE.md` first for scope, commands, and source-of-truth rules.
- Read `docs/index.md` for the canonical doc map.
- Read `docs/architecture.md` for the control-plane boundary.
- Read `docs/vault/structure.md` for vault ownership rules.
- Read `docs/vault/schema.md` for frontmatter and body shape.
- Read `app/server/models/read-model.ts` for the runtime shape actually exposed to the UI and agent APIs.
- Read the specific route, page, or service you plan to touch before editing.

## Source-of-truth hierarchy

- Product overview starts in `README.md`.
- Repo-specific operating rules live in `CLAUDE.md`.
- System boundaries live in `docs/architecture.md`.
- Vault storage rules live in `docs/vault/structure.md`.
- Vault field schemas live in `docs/vault/schema.md`.
- Agent lifecycle rules live in `docs/agents/protocol.md`.
- Runtime TypeScript validation lives in `app/shared/vault/schema.ts`.
- Runtime Go validation lives in `backend/internal/vault/schema.go`.
- If docs conflict, the more specific file wins.
- If docs and code conflict, code describes current behavior and docs should be updated.

## Verified top-level map

```text
RelayHQ-vault-first/
├── app/
│   ├── data/
│   ├── layouts/
│   ├── pages/
│   ├── server/
│   │   ├── api/
│   │   ├── models/
│   │   └── services/
│   ├── shared/
│   │   └── vault/
│   ├── test/
│   ├── nuxt.config.ts
│   └── package.json
├── backend/
│   ├── go.mod
│   └── internal/
│       └── vault/
├── cli/
│   ├── relayhq.ts
│   ├── scaffold.ts
│   └── scaffold.test.ts
├── docs/
│   ├── agents/
│   ├── prompts/
│   ├── vault/
│   ├── architecture.md
│   ├── clients.md
│   ├── index.md
│   ├── operations.md
│   ├── roadmap.md
│   ├── ux-design.md
│   └── vision.md
├── mcp/
│   └── server.ts
├── vault/
│   ├── shared/
│   │   ├── agents/
│   │   ├── approvals/
│   │   ├── audit/
│   │   ├── boards/
│   │   ├── columns/
│   │   ├── issues/
│   │   ├── projects/
│   │   ├── tasks/
│   │   ├── threads/
│   │   └── workspaces/
│   ├── system/
│   └── users/
├── ecosystem.config.cjs
├── README.md
└── CLAUDE.md
```

## Verified app map

```text
app/
├── data/
│   ├── relayhq-overview.ts
│   ├── relayhq-overview.test.ts
│   ├── task-actions.ts
│   ├── task-actions.test.ts
│   ├── task-workflow.ts
│   └── task-workflow.test.ts
├── layouts/
│   └── default.vue
├── pages/
│   ├── index.vue
│   ├── agents/index.vue
│   ├── approvals/index.vue
│   ├── audit/index.vue
│   ├── issues/[id].vue
│   ├── metrics/index.vue
│   ├── projects/index.vue
│   ├── projects/[id].vue
│   ├── settings/index.vue
│   ├── tasks/index.vue
│   ├── tasks/[id].vue
│   ├── team/index.vue
│   └── vault/index.vue
├── server/
│   ├── api/
│   ├── models/read-model.ts
│   └── services/
├── shared/vault/
│   ├── layout.ts
│   ├── schema.ts
│   └── schema.test.ts
└── test/
    ├── vault-agent-create.test.ts
    ├── vault-document-create.test.ts
    └── vault-project-create.test.ts
```

## Important current-truth caveats

- `app/components/` is not checked in right now.
- `CLAUDE.md` describes an `app/components/` directory, but the current tree has no files there.
- Shared UI is therefore page-first today, not component-library-first.
- `CLAUDE.md` lists `/boards/[board]` as a current Phase 1 route.
- The current `app/pages/` tree does not contain `boards/[id].vue` or `boards/[board].vue`.
- Do not assume a documented route exists until you verify the page file.
- `docs/vault/schema.md` lists `vault/shared/tasks/` and `vault/shared/approvals/` in the canonical layout.
- `backend/internal/vault/schema.go` includes `shared/issues/` and `shared/runs/`, but omits `shared/tasks/` and `shared/approvals/` in `CanonicalLayout()`.
- That mismatch is real in this snapshot.
- Treat it as a caution point when editing schema or layout rules.

## Root-level naming conventions

- Runtime web code lives under `app/`.
- Go validation code lives under `backend/`.
- CLI code lives under `cli/`.
- Operational docs live under `docs/`.
- Canonical shared data lives under `vault/shared/`.
- User-local overlays belong under `vault/users/`.
- Schema and template assets belong under `vault/system/`.

## File naming conventions at the repo root

- Instruction files use uppercase names like `README.md` and `CLAUDE.md`.
- Runtime config files use platform-default names like `nuxt.config.ts` and `ecosystem.config.cjs`.
- Most TypeScript source files use kebab-case names.
- Dynamic server route files use bracket params like `[id].ts` or `[taskId].get.ts`.
- Vue route files use Nuxt page naming like `projects/[id].vue`.
- Test files sit beside code as `*.test.ts` or in `app/test/*.test.ts`.

## `app/pages/` conventions

- Each checked-in page uses `<script setup lang="ts">`.
- Pages fetch data with `useAsyncData`.
- Pages import selectors and loaders from `app/data/*`.
- Pages render most view markup inline instead of composing many local components.
- Pages use `lucide-vue-next` icons directly inside the page file.
- Pages rely on Tailwind-style utility classes for styling.
- Pages usually derive route params with `useRoute()`.
- Pages typically build computed view models instead of mutating read-model records directly.

## `app/layouts/` conventions

- The main shell lives in `app/layouts/default.vue`.
- Navigation item arrays are declared in script setup.
- Workspace-selection UI also lives in `default.vue`.
- Global app framing is layout-owned, not repeated across pages.

## `app/data/` conventions

- `app/data/` is the selector and projection layer.
- `relayhq-overview.ts` exposes read-model selectors for pages.
- The data layer exports typed view records such as `WorkspaceOverviewRecord` and `BoardSummaryRecord`.
- `emptyVaultReadModel` provides a safe default for `useAsyncData` calls.
- Data helpers keep transformation logic out of pages.
- If a page needs a reusable projection over the read model, add it here before adding logic to the page.

## `app/server/models/` conventions

- `app/server/models/read-model.ts` is the runtime read-model contract.
- It maps raw vault documents into UI- and agent-facing TypeScript shapes.
- The model layer uses `workspaceId`, `projectId`, `boardId`, and `columnId` camelCase field names.
- The raw frontmatter layer uses snake_case names like `workspace_id` and `created_at`.
- Do not mix the two layers.
- Convert at the repository/model boundary.

## `app/shared/vault/` conventions

- Shared vault enums and validators live in `app/shared/vault/schema.ts`.
- Layout helpers live in `app/shared/vault/layout.ts`.
- Frontmatter type names are singular and explicit, like `TaskFrontmatter` and `WorkspaceFrontmatter`.
- Schema constants are all-caps like `VAULT_SCHEMA_VERSION`, `TASK_STATUSES`, and `TASK_COLUMNS`.

## `app/server/services/` conventions

- Business logic lives under `app/server/services/`.
- Vault reads and writes live under `app/server/services/vault/`.
- Session storage lives under `app/server/services/session/`.
- Agent protocol helpers live under `app/server/services/agents/`.
- Authz checks live under `app/server/services/authz/`.
- Metrics tracking lives under `app/server/services/metrics/`.
- Kioku integration lives under `app/server/services/kioku/`.
- Route handlers are intentionally thin and call into services.

## `app/server/api/` top-level route families

- `app/server/api/agent/` holds agent-facing coordination and search endpoints.
- `app/server/api/vault/` holds canonical vault read and write endpoints.
- `app/server/api/settings*` holds runtime settings endpoints.
- `app/server/api/runners/` holds runner-management endpoints.
- `app/server/api/kioku/` holds Kioku search integration endpoints.
- `app/server/api/metrics/` holds token-savings metrics endpoints.
- `app/server/api/health.get.ts` provides the health check route.

## Agent API route placement patterns

- Session route: `app/server/api/agent/session.get.ts`.
- Context route: `app/server/api/agent/context.get.ts`.
- Planner context route: `app/server/api/agent/planner-context.get.ts`.
- Bootstrap route: `app/server/api/agent/bootstrap/[taskId].get.ts`.
- Task listing route: `app/server/api/agent/tasks.get.ts`.
- Task creation proposal route: `app/server/api/agent/tasks.post.ts`.
- Claim-next route: `app/server/api/agent/tasks/claim-next.post.ts`.
- Search routes: `app/server/api/agent/search.post.ts` and `search-code.get.ts`.

## Vault API route placement patterns

- Read model route: `app/server/api/vault/read-model.get.ts`.
- Project create route: `app/server/api/vault/projects.post.ts`.
- Project detail route: `app/server/api/vault/projects/[id].ts`.
- Project index-status route: `app/server/api/vault/projects/[id]/index-status.get.ts`.
- Project index trigger route: `app/server/api/vault/projects/[id]/index/index.post.ts`.
- Task create route: `app/server/api/vault/tasks.post.ts`.
- Task patch route: `app/server/api/vault/tasks/[id].ts`.
- Task lifecycle routes live under `app/server/api/vault/tasks/[id]/`.
- Audit-note read route is `app/server/api/vault/audit-notes.get.ts`.
- Agent creation route is `app/server/api/vault/agents.post.ts`.
- Document routes are `app/server/api/vault/documents.get.ts` and `documents.post.ts`.
- Vault initialization route is `app/server/api/vault/init.post.ts`.

## Dynamic route naming patterns

- Dynamic params use bracket folders or files.
- A single resource param usually uses `[id]`.
- The task bootstrap route uses a more explicit `[taskId]` param name.
- Nested resource routes keep the resource family in the folder path.
- Example: task approval actions live at `app/server/api/vault/tasks/[id]/approve.ts` and `reject.ts`.

## HTTP verb file naming patterns

- A pure GET route usually ends in `.get.ts`.
- A pure POST route usually ends in `.post.ts`.
- Some PATCH routes use `.patch.ts`.
- Some handlers use plain `.ts` and enforce the method internally with `assertMethod(event, "PATCH")`.
- Verify the neighboring route family before creating a new file so you match the local pattern.

## Route implementation conventions

- Handlers use `defineEventHandler` from `h3`.
- Request validation usually starts with `isPlainRecord` guards.
- Errors are thrown with `createError({ statusCode, statusMessage })`.
- Route handlers commonly call `readBody(event)` and then pass the parsed body to a helper.
- Helpers are frequently exported from the same file for direct unit testing.
- Thin handlers wrap service calls instead of containing most business logic themselves.

## Example route style rules verified in code

- `app/server/api/vault/projects.post.ts` validates input early and writes files after resolving the shared root.
- `app/server/api/vault/tasks/[id].ts` checks `actorId` and `patch` shape before calling `patchTaskLifecycle`.
- `app/server/api/agent/session.get.ts` reads the read model once, filters it by workspace when configured, then composes the session payload.

## Where to put a new API route

- If the route is for agent orientation, claiming, searching, or bootstrap context, place it under `app/server/api/agent/`.
- If the route reads or mutates canonical vault state, place it under `app/server/api/vault/`.
- If the route is settings-related, place it under `app/server/api/settings*`.
- If the route is Kioku-specific, place it under `app/server/api/kioku/`.
- If the route is runner lifecycle, place it under `app/server/api/runners/`.
- Match the nearest existing family instead of inventing a new top-level route group.

## Example API placement predictions

- A new agent handshake endpoint should live beside `app/server/api/agent/session.get.ts`.
- A new task action like `pause` should live under `app/server/api/vault/tasks/[id]/pause.ts`.
- A new project-scoped indexing action should live under `app/server/api/vault/projects/[id]/...`.

## UI surface conventions: what is true now

- Most rendered UI currently lives in page files.
- The only checked-in layout file is `app/layouts/default.vue`.
- There are no checked-in shared components under `app/components/` right now.
- That means the dominant current pattern is page-first composition.
- Reusable view-model logic is more established than reusable component logic in this snapshot.

## Where to put a new component

- If the UI is page-specific, keep it in the page file first.
- This matches the current style in `app/pages/index.vue` and `app/pages/tasks/[id].vue`.
- If the UI needs to be reused across multiple pages, creating `app/components/` is the natural next step, but that would establish a new checked-in pattern rather than follow an existing one.
- Do not claim there is an existing component library here, because there is not.

## Fresh-agent rule for UI placement

- New route page: `app/pages/<route>.vue`.
- New route subpage with param: `app/pages/<group>/[id].vue`.
- New global shell behavior: `app/layouts/default.vue`.
- New view-model selector or summarizer: `app/data/<feature>.ts`.
- New shared reusable UI component: create `app/components/<Name>.vue` only if you are intentionally introducing that pattern.

## Styling conventions verified in pages

- Styling is utility-class-heavy.
- Classes are inline in templates rather than abstracted into CSS modules.
- Visual labels use uppercase microcopy frequently.
- Icons come from `lucide-vue-next` imports at the top of the page.
- State chips are often colored with utility classes directly in the template.

## Script conventions verified in Vue files

- Imports use relative paths, not path aliases, in the pages sampled.
- Computed state is declared close to the data fetch.
- Small helper actions stay in the page file.
- `$fetch` is used directly for writebacks from pages.
- Local errors are stored in refs like `assigneeError`.
- Route params are cast to strings when needed.

## Read-model consumption conventions

- Pages read `/api/vault/read-model` indirectly through `loadVaultReadModel`.
- Pages do not parse raw Markdown or frontmatter files directly.
- Pages search the read model with `.find()` and then project the result into page-local computed objects.
- When a page needs richer summary data, the repo prefers selector helpers in `app/data/relayhq-overview.ts`.

## Test location conventions

- Route-family tests often live beside the route implementation as `*.test.ts`.
- Examples: `app/server/api/agent/session.test.ts` and `app/server/services/vault/task-create.test.ts`.
- Service tests also live beside service files as `*.test.ts`.
- Examples: `app/server/services/vault/task-create.test.ts` and `app/server/services/authz/access.test.ts`.
- End-to-end-ish vault fixture tests live under `app/test/`.
- Examples: `app/test/vault-project-create.test.ts`, `vault-agent-create.test.ts`, and `vault-document-create.test.ts`.
- CLI tests live beside CLI files in `cli/`.
- Example: `cli/scaffold.test.ts`.

## Test runner conventions

- Most app tests use `bun:test`.
- Example imports: `import { describe, expect, test } from "bun:test"`.
- CLI scaffold tests use the Node test runner.
- Example import: `import test from "node:test"` in `cli/scaffold.test.ts`.
- Match the style already used in the area you are editing.

## Test structure conventions

- Tests commonly create temporary roots with `mkdtemp`.
- Tests commonly clean them up with `rm(..., { recursive: true, force: true })`.
- Tests seed minimal Markdown vault fixtures with `writeFile`.
- Tests call exported helpers directly instead of spinning up a full HTTP server.
- Tests assert structured errors with `rejects.toMatchObject({ statusCode: ... })`.
- Tests prefer explicit helper factories like `createReadModel()` in session and planner-context tests.

## Where to put a new test

- New route helper test: next to the route file.
- New service test: next to the service file.
- New selector test: next to the data file.
- New higher-level vault write/read regression: `app/test/`.
- New CLI behavior test: next to the CLI file in `cli/`.

## Example test placement predictions

- If you add `app/server/api/agent/foo.get.ts`, add `app/server/api/agent/foo.test.ts`.
- If you add `app/server/services/vault/bar.ts`, add `app/server/services/vault/bar.test.ts`.
- If you add `app/data/project-summary.ts`, add `app/data/project-summary.test.ts`.

## Vault file rules verified from docs and code

- Vault records are one object per file.
- YAML frontmatter stores machine-readable fields.
- The Markdown body remains human-readable.
- Shared records live under `vault/shared/**`.
- Private overlays belong under `vault/users/**` and must not leak into shared commits.
- System schema/template assets belong under `vault/system/**`.
- Shared state is canonical; RelayHQ is not treating the vault as a cache.

## Verified shared vault directories currently present

- `vault/shared/workspaces/`
- `vault/shared/projects/`
- `vault/shared/boards/`
- `vault/shared/columns/`
- `vault/shared/tasks/`
- `vault/shared/approvals/`
- `vault/shared/agents/`
- `vault/shared/audit/`
- `vault/shared/threads/`

## Workspace schema rules

- TypeScript defines `WorkspaceFrontmatter` in `app/shared/vault/schema.ts`.
- It requires `id`, `type`, `name`, `owner_ids`, `member_ids`, `created_at`, and `updated_at`.
- The read model maps those to camelCase `ownerIds`, `memberIds`, `createdAt`, and `updatedAt`.
- Workspace body text is preserved in the read model as `body`.

## Project schema rules

- `ProjectFrontmatter` lives in `app/shared/vault/schema.ts`.
- Projects require `workspace_id`, `name`, `codebase_root`, `created_at`, and `updated_at`.
- `codebase_root` may be `null`.
- The read model exposes project codebases and the optional `codebaseRoot`.

## Board and column rules

- Boards are workspace- and project-scoped.
- Columns are workspace-, project-, and board-scoped.
- Column order comes from the numeric `position` field.
- The task board UI and read model preserve that ordering.
- Valid task column values are `todo`, `in-progress`, `review`, and `done`.

## Task schema rules

- Task enums live in `app/shared/vault/schema.ts`.
- Valid task statuses are `todo`, `in-progress`, `blocked`, `waiting-approval`, `done`, and `cancelled`.
- Valid task priorities are `critical`, `high`, `medium`, and `low`.
- Tasks include execution and coordination fields like `heartbeat_at`, `execution_started_at`, `execution_notes`, `progress`, `approval_needed`, and `result`.
- Lock fields are `locked_by`, `locked_at`, and `lock_expires_at`.
- Read-model task fields become camelCase like `createdAt`, `blockedReason`, and `approvalNeeded`.

## Approval and audit rules

- Approvals are separate vault records linked to tasks.
- Tasks also carry mirrored approval state in frontmatter and read-model projections.
- Audit notes live under `vault/shared/audit/`.
- The read model keeps audit notes separate from tasks.

## Body section conventions currently used

- Task creation uses a markdown preamble for the objective.
- Task bodies may include `## Acceptance Criteria`.
- Task bodies may include `## Constraints`.
- Task bodies may include `## Context Files`.
- This is implemented in `app/server/api/vault/tasks.post.ts`.
- Bootstrap parsing in `app/server/api/agent/bootstrap/[taskId].get.ts` reads those sections back out.
- Workspace bodies are free-form markdown briefs.

## Runtime vault root rules

- Runtime vault root resolution is implemented in `app/server/services/vault/runtime.ts`.
- If `RELAYHQ_VAULT_ROOT` is set, RelayHQ uses it directly.
- Otherwise, if the current working directory basename is `app`, RelayHQ resolves the repo root via `..`.
- Otherwise, the current working directory is treated as the repo root.
- Shared vault path resolution appends `vault/shared` to the resolved root.

## Workspace filtering rules

- Workspace filtering is driven by `RELAYHQ_WORKSPACE_ID`.
- `normalizeConfiguredWorkspaceId()` only accepts the configured id if that workspace exists in the read model.
- If the configured workspace id is missing, filtering falls back to no explicit workspace filter.
- Agent session and planner-context routes both rely on that normalization pattern.

## Read-model naming conventions

- Frontmatter keys stay snake_case.
- Read-model keys are camelCase.
- Foreign keys use suffix `Id` in the read model.
- Collections are plural arrays like `projects`, `boards`, `tasks`, and `approvals`.
- View-specific selector outputs use descriptive names like `WorkspaceOverviewRecord` and `PendingApprovalRecord`.

## Agent/session protocol conventions verified in code

- `GET /api/agent/context` returns counts and summaries, not raw vault body text.
- `app/server/api/agent/context.test.ts` explicitly asserts that workspace, project, board, column, and task bodies must not leak from context.
- `GET /api/agent/planner-context` returns `workspaceBrief` derived from the workspace body.
- `GET /api/agent/session` returns session context, tasks, optional bootstrap data, and a protocol section.
- The session protocol section now carries the normalized workspace brief.
- Task-specific protocol instructions still live in bootstrap packs as `protocolInstructions`.

## Session response placement rule

- If you need workspace-wide human-authored instructions, put them in the workspace body.
- Expect `GET /api/agent/session` to expose that body through the response protocol section.
- Expect `GET /api/agent/planner-context` to expose the same body as `workspaceBrief`.
- Do not expect `GET /api/agent/context` to expose raw body text.

## Agent protocol rules from docs and runtime

- Agents select tasks assigned to themselves.
- Agents should claim before working.
- Agents should heartbeat during work.
- Agents should request approval when a risky action needs a human decision.
- Agents should mark tasks done with a concrete result.
- RelayHQ owns coordination state, visibility, and audit.
- The agent runtime owns execution details.

## Naming conventions for identifiers

- Workspace ids use `ws-` prefixes.
- Project ids often use `project-<slug>-<suffix>`.
- Board ids often use `board-<slug>-<suffix>`.
- Column ids often use `col-<name>-<suffix>`.
- Task ids may be semantic (`kioku-04-retrieval-api`) or numeric (`task-001`) depending on how they were created.
- Agent ids use `agent-` prefixes.
- Approval ids use `approval-` prefixes.

## Naming conventions for functions and helpers

- Read helpers often start with `read`.
- Create helpers often start with `create`.
- Patch or sync helpers use verbs like `patch`, `sync`, `build`, `select`, and `resolve`.
- Projection helpers use `select` and `build` heavily in `app/data/relayhq-overview.ts`.
- Runtime path helpers use `resolve` in `app/server/services/vault/runtime.ts`.

## Error-handling conventions

- Route layers prefer `createError` with explicit HTTP status codes.
- Service and schema layers throw typed errors like `VaultSchemaError` and task-create errors.
- Tests assert error status codes directly rather than matching on long messages alone.

## Fresh-agent placement cheat sheet

- New agent-facing GET endpoint: `app/server/api/agent/<name>.get.ts`.
- New task lifecycle action: `app/server/api/vault/tasks/[id]/<action>.ts`.
- New page route: `app/pages/<route>/index.vue` or `app/pages/<route>/[id].vue`.
- New selector: `app/data/<feature>.ts`.
- New schema enum or frontmatter change: `app/shared/vault/schema.ts` and `backend/internal/vault/schema.go`.
- New schema or protocol doc update: `docs/vault/*` or `docs/agents/*`.
- New vault regression test: `app/test/<feature>.test.ts`.

## Things not to assume

- Do not assume `app/components/` already exists as a lived-in pattern.
- Do not assume a boards page exists because docs mention one.
- Do not assume every doc is perfectly synchronized with current code.
- Do not assume the active workspace filter is valid until you verify the workspace id exists in the read model.
- Do not assume raw vault body text is safe to expose from generic context endpoints.

## Final orientation summary

- RelayHQ is currently a page-first Nuxt app over a vault-backed control plane.
- New API routes belong under `app/server/api/` in the nearest existing family.
- New page-specific UI belongs in the relevant `app/pages/*.vue` file.
- New shared view-model logic belongs in `app/data/`.
- New tests usually live beside the code they verify, with broader vault regressions under `app/test/`.
- Vault schema edits must stay aligned across docs, TypeScript, and Go.
- Workspace brief text belongs in the workspace body and is exposed to agents through the session protocol section.
