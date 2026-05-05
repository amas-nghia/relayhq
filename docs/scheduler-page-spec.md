# Scheduler Page Spec

Status: draft

## Goal

Turn `scheduled` from a weak Kanban column into a first-class scheduling surface.

The Scheduler page answers:
- when a task will run
- whether it is one-time or recurring
- why it is waiting
- what will run next
- which agent is expected to run it

This page should complement the board, not replace it.

Board answers: `what is being worked on now`

Scheduler answers: `what is planned to run later`

## Product Principles

1. Board is for active work.
2. Scheduler is for time-based intent.
3. Recurring and one-time schedules must be understandable at a glance.
4. Scheduling actions must be easier than editing raw fields in task detail.
5. The page should feel operator-first, not like a generic consumer calendar.

## Primary Users

1. Operator assigning future work to agents.
2. PM/lead reviewing upcoming workload.
3. Ops user debugging why something did not auto-run.

## Core Use Cases

1. See all tasks scheduled for today and this week.
2. Create or edit a one-time run time.
3. Create or edit a recurring schedule.
4. See blocked scheduled tasks and the reason.
5. Run a scheduled task immediately.
6. Pause or remove recurrence.
7. Check which agent will receive scheduled work.

## Information Architecture

Route:
- `/schedule`

Sub-views:
- `Agenda`
- `Calendar`
- `Recurring`
- `Queue`

Recommended default tab:
- `Agenda`

Reason:
- easiest starting point
- best for operators
- simplest phase-1 implementation

## Data Model Expectations

The page should rely on existing task fields where possible:
- `status`
- `column`
- `next_run_at`
- `cron_schedule`
- `assignee`
- `dispatch_status`
- `dispatch_reason`
- `blocked_reason`
- `last_dispatch_attempt_at`

Optional future additions:
- `schedule_timezone`
- `last_run_at`
- `run_window_start`
- `run_window_end`
- `schedule_enabled`

## Page Structure

### Top Bar

Contains:
- page title: `Scheduler`
- time range switcher
- search
- quick create scheduled task button
- current timezone display

### Left Rail

Contains filters:
- project
- agent
- status
- scheduled type: one-time / recurring
- dispatch state: queued / blocked / ready / failed
- time range presets: today / tomorrow / this week / next 7 days / all

### Main Content

Changes per tab.

### Right Detail Panel

Shows details for selected scheduled task:
- title
- next run time
- recurrence rule
- assigned agent
- dispatch state
- blocked reason
- actions

Actions:
- reschedule
- run now
- pause recurrence
- remove recurrence
- open task detail

## Phase 1 UX

### Agenda Tab

This should be the first implementation target.

Layout:
- date-grouped list
- each group labeled by day
- tasks sorted by `next_run_at`

Each row should show:
- time
- task title
- project badge
- agent badge
- one-time or recurring badge
- dispatch badge
- blocked badge if relevant

Row interactions:
- click row selects it and opens right panel
- secondary action menu on row

Row actions menu:
- run now
- reschedule
- duplicate schedule
- remove schedule

### Queue Tab

Purpose:
- show scheduled tasks that are not currently running
- especially useful once dispatch semantics are fixed

Buckets:
- queued
- blocked
- failed to launch

Each card/row should explain why:
- `agent already busy`
- `runtime not ready`
- `waiting for dependency`
- `approval required`

### Recurring Tab

Purpose:
- manage tasks with `cron_schedule`

List columns:
- task
- rule
- next run
- assignee
- state
- last dispatch attempt

Actions:
- edit rule
- pause
- convert to one-time
- run now

### Calendar Tab

This should be phase 2, not phase 1.

Recommended modes:
- week view
- day view

Avoid month-first design in phase 1 because:
- too much density
- harder drag/reschedule behavior
- less useful for operator workflows

## Visual Language

The page should feel like:
- scheduling console
- operational planner
- timeline board

Not like:
- soft consumer calendar
- personal agenda app

Recommended style traits:
- dense but readable
- strong typography hierarchy
- precise time labels
- state badges with clear meaning
- minimal rounded surfaces
- consistent border-based grouping

## Status Semantics

Important distinction:

1. `scheduled` is a task lifecycle state.
2. `dispatch_status` describes launch readiness.

The Scheduler page must visualize both.

Example combinations:

1. `status=scheduled`, `dispatch_status=idle`
- scheduled normally

2. `status=scheduled`, `dispatch_status=blocked`
- scheduled but currently unable to launch

3. `status=todo`, `dispatch_status=queued`
- assigned future work waiting for slot

4. `status=in-progress`
- should not be the main state of this page
- show only if a scheduled task has actually started

## Wireframe

```text
+-----------------------------------------------------------------------------------+
| Scheduler                                           [Today] [Week] [Create Task] |
| Timezone: Asia/Ho_Chi_Minh                                                Search |
+---------------------------+-------------------------------------------------------+
| Filters                   | Agenda                                                |
|                           |                                                       |
| Project                   | Tue, Apr 30                                           |
| [All projects        v]   | 09:00  [Recurring] [Queued]  Daily summary            |
|                           |        project-relayhq   agent-thangly                |
| Agent                     |                                                       |
| [All agents          v]   | 13:30  [One-time] [Blocked]  Weekly analytics sync    |
|                           |        project-relayhq   gpt-5-5                      |
| Dispatch                  |        reason: agent already busy                     |
| [All states         v]    |                                                       |
|                           | Wed, May 1                                            |
| Type                      | 08:00  [Recurring] [Ready]  Morning queue sweep       |
| [All types          v]    |                                                       |
|                           |                                                       |
| Range                     |                                                       |
| [Next 7 days        v]    |                                                       |
+---------------------------+-------------------------------+-----------------------+
| Selected Task                                             | Detail                |
|                                                           |                       |
|                                                           | Weekly analytics sync |
|                                                           | Next run: Apr 30 13:30|
|                                                           | Agent: gpt-5-5        |
|                                                           | Dispatch: blocked     |
|                                                           | Reason: agent busy    |
|                                                           |                       |
|                                                           | [Run now]             |
|                                                           | [Reschedule]          |
|                                                           | [Pause recurrence]    |
|                                                           | [Open task]           |
+-----------------------------------------------------------------------------------+
```

## Interaction Notes

### Create Scheduled Task

Open a focused modal with:
- task title
- project
- assignee
- one-time vs recurring toggle
- date/time picker or cron preset
- optional notes

### Reschedule

Should be quick.

Prefer:
- lightweight right-panel inline editor
or
- compact modal

Avoid forcing the user into raw task detail for simple time changes.

### Run Now

Should:
- preserve original schedule if recurring
- override timing only for this run
- clearly indicate action result

### Pause Recurrence

Should not delete the rule silently.

Recommended:
- pause flag or clear visual disabled state in future implementation

## Empty States

Agenda empty:
- `No scheduled tasks in this range.`
- CTA: `Schedule a task`

Recurring empty:
- `No recurring automations yet.`

Queue empty:
- `No queued or blocked scheduled work.`

## Phase Breakdown

### Phase 1

Build:
- `/schedule`
- agenda list
- recurring list
- right detail panel
- basic filters
- run now / reschedule actions

### Phase 2

Build:
- calendar week view
- drag to reschedule
- grouped agent lanes

### Phase 3

Build:
- capacity-aware schedule warnings
- conflict detection
- quiet hours / run windows
- per-agent schedule density insights

## Dependencies Before Implementation

Before full Scheduler UX, this bugfix should land:
- assigned tasks should not jump to `in-progress` before real execution

Why:
- scheduler must distinguish planned work from active work
- current semantics blur that line

## Success Criteria

This page is successful when:
- users no longer need the `scheduled` board column for most scheduling work
- operators can understand upcoming work in under 10 seconds
- blocked or queued scheduled tasks explain themselves clearly
- recurring tasks are manageable without editing raw task metadata
