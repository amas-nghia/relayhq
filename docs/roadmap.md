# Roadmap

## Implementation model

RelayHQ grows as one app with clear domain modules, staying small and testable at each phase.

---

## Phase 1: Core Kanban control plane ✅

**Status: complete**

- Workspace / project / board / column / task hierarchy
- Task lifecycle: todo → in-progress → review → done
- Human and agent assignment
- Approval gates — task pauses at `waiting-approval` until a human acts
- Audit trail — every action writes a timestamped note to `vault/shared/audit/`
- Agent registry — capabilities, approval requirements, and task types per agent
- Multi-agent coordination — task locks with expiry prevent double-claiming
- MCP server — `relayhq_*` tools for Claude Code and any MCP-compatible runtime
- CLI — `bun run ./cli/relayhq.ts` for headless agent use
- React Kanban UI + onboarding wizard

**Goal:** coordinate work through visible boards with clear ownership and traceability.

---

## Phase 2: Scheduled tasks, rate limits, and model fallback

**Status: planned**

### Scheduled tasks

Agents and humans can defer tasks to a future time.

User flow:
1. Agent hits a rate limit (HTTP 429 with `Retry-After: 120`)
2. Agent calls `relayhq_schedule_task(taskId, retryAfterSeconds=120)`
3. Task moves to **Scheduled** column with a countdown badge showing time remaining
4. Cron scheduler (60-second tick) detects `nextRunAt ≤ now`
5. Task moves back to `in-progress`; agent is notified and resumes
6. Humans can also defer any task using "Run later" from the board

### Model fallback chain

Agents declare a `fallback_models` array in their registry entry. On 429:
1. Retry current model after back-off
2. If still rate-limited, switch to first fallback model
3. Write a note in the task: "switched to claude-haiku-4-5 due to rate limit"

### Recurring tasks

Tasks can carry a cron expression (`recurrence: "0 9 * * 1"` = every Monday at 9am).
On completion, the scheduler creates a fresh copy with the next `nextRunAt`.

### Modules
- `scheduled` status + `nextRunAt` field on task frontmatter
- `POST /api/vault/tasks/:id/schedule` endpoint
- Cron scheduler service (60-second tick)
- Rate-limit detection middleware in agent session handler
- Scheduled column + countdown UI in BoardView

---

## Phase 3: Templates, comments, and real-time board

**Status: planned**

### Task templates

Reusable task shapes so agents and humans don't start from blank each time.

User flow:
1. From NewTaskModal, click "Use template"
2. Pick a template (e.g. "Bug report", "Code review", "Deploy checklist")
3. Fields pre-fill: objective, acceptance criteria, context files, priority
4. Adjust and create

Templates are stored in `vault/shared/templates/` as Markdown files with YAML frontmatter.

### Comments and threads

Per-task discussion that lives in the vault alongside the task.

User flow:
1. Open task detail panel → click "Add comment"
2. Comment is written to `vault/shared/threads/thread-{taskId}-{ts}.md`
3. Both humans and agents can comment; comments appear in the detail panel timeline
4. Agent can reference comments in its execution notes

### Real-time board (WebSocket)

Replace 5-second polling with push updates.

- Nuxt 3 `defineWebSocketHandler` broadcasts board changes to all connected clients
- React client subscribes on mount; status changes, new tasks, and heartbeats appear instantly
- Fallback to polling for clients that cannot upgrade

### Modules
- Task template schema + CRUD API
- Template selector in NewTaskModal
- Comments/threads vault schema + API
- Comments UI in DetailPanel timeline
- WebSocket handler in Nuxt 3
- React WebSocket hook replacing polling interval

---

## Phase 4: Project docs and semantic search

**Status: planned**

### Project documents

POs and PMs need more than a task list attached to a project.

Each project can carry:
- Description and problem statement
- Budget and deadline
- Customer requirements and acceptance criteria
- Meeting notes, design briefs, technical specs
- External links (Figma, Confluence, Notion, etc.)

Documents are stored as Markdown in `vault/shared/docs/` linked to the project via `project_id`.
Attachments (PDFs, audio, binary) are stored as link references — MCP converters can later turn them into Markdown before indexing.

### Semantic search (Kioku)

Project documents and task bodies are indexed into Kioku (SQLite + vector embeddings) on write.

User flow:
1. User types in the search bar: "auth middleware compliance"
2. Kioku returns matching tasks, docs, and meeting notes ranked by semantic similarity
3. Results link directly to the relevant vault file

Agent flow:
1. Agent calls `relayhq_search("JWT session token storage")` at session start
2. Gets back the relevant spec doc and related tasks
3. Proceeds with full context instead of re-reading everything

Optional: Kioku vector graph endpoint for visualising document relationships.

### Modules
- Project schema extension: `description`, `budget`, `deadline`, `links`, `status`, `attachments`
- `PATCH /api/vault/projects/:id` with new fields
- Project detail view (ProjectView.tsx) with full PO/PM layout
- `POST /api/vault/docs` + `GET /api/vault/docs` for project documents
- Kioku indexing on document write
- Kioku vector graph API (optional)
- Search bar in Shell.tsx wired to Kioku

---

## Phase 5: Notifications, analytics, and mobile

**Status: planned**

### Notifications

Stay informed without watching the board.

- **Slack**: send a message when a task needs approval, an agent goes stale, or a task is completed
- **Webhooks**: generic outbound POST to any URL — integrate with Teams, Discord, custom systems
- Notification rules are per-workspace; configured in settings

### Analytics dashboard

Answer: how fast are tasks moving? how much is it costing?

Metrics tracked per task:
- `tokens_used`, `cost_usd`, `model` — written by agent on completion
- Cycle time: `completed_at - created_at`
- Approval wait time: time between `waiting-approval` and approval decision

Dashboard surfaces:
- Total cost and token usage per project / per agent / per time period
- Throughput: tasks completed per week
- Blocked rate: % of tasks that hit `blocked` status
- Average cycle time

### Mobile board

The Kanban board works on phones.

- Horizontal scroll on small screens (snap-scrolling between columns)
- Touch-friendly card tap to open detail panel
- Swipe gesture on a card to move it to the next column

### Modules
- Notification rules schema + settings UI
- Slack webhook sender
- Generic outbound webhook service
- Analytics API (`GET /api/analytics/summary`, `/api/analytics/tasks`)
- Analytics dashboard page
- Mobile CSS: `overflow-x: auto` + `scroll-snap` on board columns
- Touch gesture handler for column transitions

---

## Phase 6: Agent SDK, skill system, and subtasks

**Status: planned**

### Agent SDK

`@relayhq/agent-sdk` — TypeScript npm package with typed helpers.

```ts
import { RelayHQClient } from '@relayhq/agent-sdk'

const relay = new RelayHQClient({ baseUrl: 'http://127.0.0.1:44210' })

const { tasks } = await relay.sessionStart({ agentId: 'my-agent' })
await relay.claim(tasks[0].id, { agentId: 'my-agent' })
await relay.heartbeat(tasks[0].id, { agentId: 'my-agent' })
await relay.complete(tasks[0].id, { agentId: 'my-agent', result: 'Done.' })
```

Eliminates the need to call raw HTTP endpoints or use the CLI for every operation.

### Skill system

Installable SKILL.md files that inject structured context into agent sessions.

```bash
npx relayhq skill install @relayhq/skill-code-review
npx relayhq skill install @relayhq/skill-test-writing
npx relayhq skill list
```

Each skill is a Markdown file added to `vault/shared/skills/`. When an agent calls `session_start`, relevant skills are surfaced in the bootstrap context based on the task type.

### Agent subtasks

Parent tasks can spawn child tasks. Progress rolls up.

Agent flow:
1. Agent receives task "Implement auth module"
2. Determines it needs to be split; calls `relayhq_create_subtask(parentId, { title: "Write JWT middleware", ... })`
3. Child task appears on the board linked to the parent
4. When all children complete, parent can be marked done

### Shared context pool

Reduce token costs when multiple agents work in the same workspace.

- `session_start` returns an etag for the current workspace context
- Agents that already have the context skip re-fetching it (etag match)
- Estimated 30–40% token savings in multi-agent sessions

### Modules
- `@relayhq/agent-sdk` npm package
- Skill schema + `vault/shared/skills/` directory
- `POST /api/vault/tasks/:id/subtasks` endpoint
- Parent–child task UI in board and detail panel
- Etag-based context deduplication in `GET /api/agent/session`

---

## Phase 7: Agent improvement loops

**Status: planned**

- Outcome feedback — label task results as successful, partial, or failed
- Approval/result correlation — which agent decisions were overturned?
- Quality review inputs — structured post-task review by human or second agent
- Improvement signal analysis — surface patterns: which task types stall, which agents overshoot estimates?

**Goal:** improve agent behavior from real work history stored in the vault.

---

## Roadmap rules

- Keep each phase shippable independently
- Preserve auditability across phases — everything writes to the vault
- Prefer simple coordination primitives over broad abstraction
- Keep service boundaries visible even when everything is still in one app
- Boards and flow visibility are the main operating surface; approvals and audit are layered around them
