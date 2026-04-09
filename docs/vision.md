# RelayHQ Vision

## Product definition

RelayHQ is a control plane for agent-assisted work.

It coordinates work across people and agents by providing:

- a place to define projects and work items
- ownership and assignment
- approvals for controlled actions
- status and progress visibility
- an audit trail of decisions and actions

RelayHQ does not do the work itself. It manages the work around the runtime that does the work.

## Problem it solves

Teams using agents need more than a prompt and a chat window.

They need:

- a stable home for work across multiple projects
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
- define plans and break them into tasks
- assign work to humans or agents
- review status and approve actions
- track progress and outcomes

Agents use RelayHQ to:

- receive tasks
- report progress
- request approvals
- post completion notes
- feed results back into future work

### Example flow

1. A human creates a project.
2. The project is broken into tasks.
3. Some tasks are assigned to agents.
4. An agent asks for approval before acting.
5. The human approves.
6. The agent completes the task and updates status.
7. RelayHQ preserves the history.

## RelayHQ vs. the agent runtime

RelayHQ is the control plane.

The agent runtime is the execution layer.

RelayHQ:

- stores work structure
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

RelayHQ should grow into a workspace for ongoing agent-assisted operations, not just isolated tasks.

Planned capability areas:

- multi-project workspaces
- plans
- task breakdowns
- chat
- reminders
- progress tracking
- customer reporting
- agent improvement loops

### Multi-project workspaces

A workspace should hold related projects, teams, and activity in one place.

### Plans and task breakdowns

Plans should turn into structured tasks that can be assigned, tracked, and reviewed.

### Chat

Chat should support coordination, decisions, and handoffs tied to actual work, not just free-form conversation.

### Reminders

Reminders should bring attention back to blocked, overdue, or waiting work.

### Progress tracking

Progress tracking should show:

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
