# RelayHQ Vision

## Product definition

RelayHQ is a Kanban-first control plane for agent-assisted project work.

It coordinates work across people and agents by providing:

- a place to define projects, boards, and work items
- a visible flow of work across stages
- ownership and assignment
- approvals for controlled actions
- status and progress visibility
- an audit trail of decisions and actions

RelayHQ does not do the work itself. It manages the work around the runtime that does the work.

## Problem it solves

Teams using agents need more than a prompt and a chat window.

They need:

- a stable home for work across multiple projects
- a board that makes the flow of work visible
- a way to see where tasks are blocked or piling up
- clear handoffs between people and agents
- explicit approval for risky or expensive actions
- progress tracking that survives context loss
- reporting that shows what happened and why
- feedback loops that improve agent behavior over time

## Who it is for

RelayHQ is for teams that:

- use agents in real work
- need accountability and traceability
- manage more than one project at a time
- want humans and agents to share the same coordination system

## How people and agents interact

People use RelayHQ to:

- create workspaces and projects
- define boards, columns, and tasks
- move work through visible workflow stages
- assign work to humans or agents
- review status and approve actions
- track progress and outcomes

Agents use RelayHQ to:

- receive tasks
- report progress
- update work movement when allowed
- request approvals
- post completion notes
- feed results back into future work

### Example flow

1. A human creates a project.
2. The project gets a board and workflow columns.
3. Tasks are added as cards on the board.
4. Some tasks are assigned to agents.
5. Work moves across stages as it progresses.
6. An agent asks for approval before risky actions.
7. RelayHQ preserves movement, ownership, and history.

## RelayHQ vs. the agent runtime

RelayHQ is the control plane.

The agent runtime is the execution layer.

RelayHQ:

- stores work structure and board structure
- routes tasks and approvals
- tracks progress
- records history
- supports reporting and oversight

Agent runtime:

- runs the model or agent process
- executes the actual work
- manages tool use, prompting, and inference

RelayHQ should integrate with runtimes, not replace them.

## Long-term vision

RelayHQ should grow into a workspace for ongoing agent-assisted operations, centered on Kanban-style boards and work flowing through them.

Planned capability areas:

- multi-project workspaces
- boards and columns
- plans
- task breakdowns
- chat
- reminders
- progress tracking
- customer reporting
- agent improvement loops

### Multi-project workspaces

A workspace should hold related projects, teams, and activity in one place.

### Boards and columns

Boards should be the main operating surface for day-to-day work.

Columns should represent workflow stages so humans and agents can see where work is, where it is blocked, and what needs attention next.

### Plans and task breakdowns

Plans should turn into structured tasks that can be assigned, tracked, and reviewed.

### Chat

Chat should support coordination, decisions, and handoffs tied to actual work, not just free-form conversation.

### Reminders

Reminders should bring attention back to blocked, overdue, or waiting work.

### Progress tracking

Progress tracking should show:

- column distribution
- current status
- ownership
- blockers
- recent changes
- what needs attention next

### Customer reporting

Customer reporting should turn internal work into clear updates for external stakeholders.

### Agent improvement loops

RelayHQ should capture outcomes so teams can improve agents over time through:

- task results
- approval patterns
- failure cases
- review notes
- reusable feedback

## What RelayHQ is not

RelayHQ is not:

- the agent runtime
- a generic chat app
- a full automation platform
- a marketplace for agents
- a billing system

## Summary

RelayHQ exists to make agent-assisted work governable, traceable, and coordinated across projects.

Its main operating surface should be a board that makes work movement visible, while approvals, audit, and agent coordination remain layered around that flow.
