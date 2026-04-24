# RelayHQ Current User Flow

This document describes the full user flow for the parts of RelayHQ that are actively used now.

It intentionally excludes flows for features that are incomplete, inactive, or not part of the current operational path, including issues, vault docs, planner context, code indexing UI, metrics dashboards, and broader frontend redesign work.

## Scope

- Include: workspace dashboard, project view, board view, task list, task detail, approvals, audit trail, agent CLI lifecycle
- Exclude: features not currently part of the main working loop
- Source of truth: vault files under `vault/shared/**`

## Core Principle

RelayHQ is a vault-first coordination control plane.

RelayHQ does:
- track work
- show ownership
- show progress
- stop work at approval gates
- preserve traceability

RelayHQ does not:
- execute the work itself
- replace the runtime
- become the hidden source of execution state

## Actors

### Human PM / Reviewer
- Monitors overall state
- Creates tasks
- Reviews boards and task detail
- Approves or rejects risky work
- Uses audit trail to understand what happened

### Agent
- Pulls or receives assigned tasks
- Claims work
- Updates heartbeat and progress
- Requests approval when needed
- Marks work done or blocked
- Uses CLI or API, not the UI

### RelayHQ App/API
- Reads the vault
- Builds the read model
- Serves UI and API responses
- Writes coordination state back into the vault

### Vault
- Canonical storage for shared coordination state
- One Markdown file per object with YAML frontmatter

## Main Objects In Use

- Workspace
- Project
- Board
- Column
- Task
- Approval
- Audit note
- Agent registry record

## Active Surfaces

### Human UI
- `/`
- `/projects/[id]`
- `/boards/[board]`
- `/tasks`
- `/tasks/[id]`
- `/approvals`
- `/audit`
- `/agents`

### Agent/API
- `GET /api/vault/read-model`
- `POST /api/vault/tasks`
- `PATCH /api/vault/tasks/[id]`
- `POST /api/vault/tasks/[id]/claim`
- `POST /api/vault/tasks/[id]/heartbeat`
- `POST /api/vault/tasks/[id]/request-approval`
- `POST /api/vault/tasks/[id]/approve`
- `POST /api/vault/tasks/[id]/reject`
- `GET /api/vault/audit-notes`
- `POST /api/kioku/search`

### Agent CLI
- `bun run ./cli/relayhq.ts tasks --assignee=<agent>`
- `bun run ./cli/relayhq.ts claim <taskId> --assignee=<agent>`
- `bun run ./cli/relayhq.ts heartbeat <taskId> --assignee=<agent>`
- `bun run ./cli/relayhq.ts request-approval <taskId> --assignee=<agent> --reason="..."`
- `bun run ./cli/relayhq.ts update <taskId> --assignee=<agent> --status=done --result="..."`

## End-to-End Operating Model

1. Shared vault files exist under `vault/shared/**`.
2. RelayHQ reads them and builds a canonical read model.
3. Human opens the UI and sees the current coordination state.
4. Agent uses CLI or API to claim and update tasks.
5. Human steps in only when visibility or approval is needed.
6. Every important coordination change is written back into the vault.
7. Audit notes preserve key milestones or decisions.

## Flow 1: Human Opens RelayHQ And Checks Overall Status

### Goal
- Understand the current state of work quickly
- See whether any approvals need action
- Decide where to drill down next

### Steps

1. Human opens the RelayHQ web app.
2. The app loads `GET /api/vault/read-model`.
3. The dashboard at `/` shows:
   - workspace summary
   - key metrics
   - primary board link
   - project link
   - approval CTA if approvals are pending
4. Human uses the dashboard plus sidebar to decide the next action.

### Typical Decisions From Here
- Go to board to scan work in motion
- Go to tasks list to search for a specific item
- Go to approvals to unblock work
- Go to audit to understand recent coordination history

## Flow 2: Human Reviews The Board

### Goal
- Scan current workflow state by column
- Identify stuck, stale, or approval-gated work

### Steps

1. Human opens the board page.
2. RelayHQ shows the board columns:
   - `todo`
   - `in-progress`
   - `review`
   - `done`
3. Each task card exposes operational coordination signals:
   - title
   - id
   - assignee
   - priority
   - progress
   - stale status when present
   - approval state when relevant
4. Human scans for:
   - too many items in `todo`
   - stale items in `in-progress`
   - items blocked in `review` or waiting approval
   - recently finished work in `done`
5. Human clicks a task card to see task detail.

### Outcome
- Human gets a fast operational picture of work movement

## Flow 3: Human Reviews The Full Task List

### Goal
- Find tasks quickly across the workspace
- Search and filter without scanning a single board manually

### Steps

1. Human opens `/tasks`.
2. The page loads all tasks from the read model.
3. Human can:
   - filter by project
   - switch between list and grouped board-style views
   - search by text
4. If the search box is empty:
   - the UI shows tasks from the canonical read model
5. If the search box has text:
   - the UI uses `POST /api/kioku/search`
   - matching tasks are shown from Kioku-backed retrieval results
6. Human clicks a task to open `/tasks/[id]`.

### Outcome
- Human locates the right task faster than scanning the board alone

## Flow 4: Human Creates A Task

### Goal
- Create a new coordination item and place it into the shared workflow

### Steps

1. Human opens the task list page.
2. Human clicks `New Task`.
3. Human fills the modal form:
   - title
   - project
   - board
   - priority
   - assignee
4. UI sends `POST /api/vault/tasks`.
5. RelayHQ validates the request.
6. RelayHQ writes a new task Markdown file into the shared vault.
7. UI refreshes the read model.
8. The task appears in the list and in the board.

### Outcome
- A new vault-backed task becomes part of the visible control plane

## Flow 5: Agent Finds Work To Start

### Goal
- Select a task that is assigned and ready

### Steps

1. Agent starts in CLI or through an automation loop.
2. Agent calls the CLI task-list command for its assignee id.
3. RelayHQ returns tasks appropriate for that assignee.
4. Agent chooses one task that is ready to begin.

### Selection Rules
- Assigned to the agent
- Not already done
- Not cancelled
- Not blocked by dependencies according to current task selection logic

### Outcome
- Agent knows exactly which coordination item it should work on

## Flow 6: Agent Claims The Task

### Goal
- Make task ownership explicit and visible

### Steps

1. Agent calls claim for the chosen task.
2. RelayHQ updates the task in the vault with:
   - `status: in-progress`
   - `execution_started_at`
   - `heartbeat_at`
3. The task now appears as active work in the board and task detail views.

### Outcome
- Ownership becomes visible to humans and other agents

## Flow 7: Agent Reports Progress While Working

### Goal
- Keep the control plane up to date while execution happens elsewhere

### Steps

1. Agent continues work in its runtime.
2. Agent periodically sends heartbeat updates.
3. Agent may also update:
   - `progress`
   - `execution_notes`
4. RelayHQ writes those changes back into the task file.
5. Human sees updated progress and freshness in the UI.

### Outcome
- Work stays observable instead of becoming a black box

## Flow 8: Agent Requests Approval

### Goal
- Stop risky work until a human explicitly allows it

### Trigger
- Agent reaches a risky or policy-sensitive action

### Steps

1. Agent sends request-approval with a reason.
2. RelayHQ updates the task state:
   - `approval_needed: true`
   - `approval_reason`
   - `status: waiting-approval`
3. The task becomes visible as waiting for human action.
4. The approvals queue reflects the pending item.
5. Agent stops and waits.

### Outcome
- Human approval becomes a hard checkpoint in the workflow

## Flow 9: Human Reviews And Resolves Approval

### Goal
- Unblock or stop risky work intentionally

### Steps

1. Human opens `/approvals`.
2. Human sees all pending approval items.
3. For each item, the screen shows:
   - task id
   - task title
   - reason for request
   - requester
   - request timestamp
4. Human chooses one of the available actions.

### Branch A: Approve

1. Human clicks approve.
2. UI sends `POST /api/vault/tasks/[id]/approve`.
3. RelayHQ writes approval state into the vault.
4. The task leaves the waiting-approval state.
5. Agent can continue work.

### Branch B: Reject

1. Human clicks reject.
2. Human provides a reason when prompted.
3. UI sends `POST /api/vault/tasks/[id]/reject`.
4. RelayHQ records the rejection and updates task state.
5. Agent remains stopped and the task reflects the failed gate.

### Outcome
- Approval gates are explicit, visible, and auditable

## Flow 10: Human Reviews A Task In Detail

### Goal
- See the complete coordination state for one task

### Steps

1. Human opens `/tasks/[id]`.
2. The page shows:
   - task id
   - title
   - status
   - priority
   - assignee
   - description/body
   - vault path
   - tags
   - approval block if relevant
   - coordination or timeline information
3. Human may perform local coordination actions such as:
   - approve
   - reject
   - edit assignee
4. Human uses this page when the board card does not provide enough context.

### Outcome
- One task can be reviewed and acted on without ambiguity

## Flow 11: Agent Completes The Task

### Goal
- Mark the coordination item finished and record the result

### Steps

1. Agent finishes the work in its runtime.
2. Agent calls update with final values such as:
   - `status: done`
   - `result`
   - `completed_at`
3. RelayHQ writes the completion state into the vault.
4. Task moves to `done` in board/list views.
5. If an audit note is written, it becomes visible in audit history.

### Outcome
- Completion is recorded canonically in the control plane

## Flow 12: Agent Reports A Blocker

### Goal
- Preserve visibility when work cannot continue

### Steps

1. Agent determines it cannot continue.
2. Agent updates the task to a blocked state.
3. RelayHQ records:
   - `status: blocked`
   - `blocked_reason`
   - `blocked_since`
4. Human sees the blocked item in the UI.
5. Human decides how to unblock or reassign the task.

### Outcome
- Failure or blockage becomes visible instead of hidden

## Flow 13: Human Reviews The Audit Trail

### Goal
- Understand what happened and why

### Steps

1. Human opens `/audit`.
2. UI loads `GET /api/vault/audit-notes`.
3. RelayHQ returns real audit note records from `vault/shared/audit/*.md`.
4. The page shows:
   - message
   - source
   - relative timestamp
   - source path
   - link to the related task when present
5. Human filters or clicks through as needed.

### Outcome
- Decisions and milestones remain traceable after the fact

## Flow 14: Human Reviews The Agent Registry

### Goal
- Understand who can do what

### Steps

1. Human opens `/agents`.
2. UI loads the agent registry from the read model.
3. Human sees:
   - agent name
   - role
   - status
   - capabilities
   - current locked task if present
4. Human uses the page to understand assignment possibilities, not to run the agents.

### Outcome
- Assignment capacity is visible at the coordination layer

## Happy Path Summary

1. Human creates a task.
2. Agent claims it.
3. Agent reports progress and heartbeats.
4. Agent requests approval if needed.
5. Human approves.
6. Agent continues.
7. Agent marks task done.
8. Human sees the result on board, task detail, approvals, and audit.

## Failure Path Summary

1. Agent claims a task.
2. Agent hits a blocker or is rejected at approval.
3. RelayHQ records the blocked or rejected state.
4. Human sees the problem in the board or task detail.
5. Human decides how to unblock, revise, or stop the work.

## Why This Flow Matters

The current product is not a general execution platform. It is a coordination layer that keeps the following things explicit:

- what work exists
- who owns it
- what state it is in
- where approval is required
- what changed over time

That is the current working user flow of RelayHQ.
