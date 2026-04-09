# Agent Execution Protocol

## Purpose

This protocol defines how RelayHQ coordinates a task across layered agents.

## Why it exists

RelayHQ needs a consistent way to:

- intake work
- break it down
- choose the right agent(s)
- log progress step by step
- capture results and feedback
- improve prompts/templates after a pilot

## Protocol

### 1. Intake

Record the task before execution starts.

Required:

- task ID
- request source
- desired outcome
- deadline or urgency
- constraints
- owner / reviewer

If the request is vague, return it for clarification before assigning work.

### 2. Decompose

Split the task into small steps.

A good decomposition:

- has one outcome per step
- names dependencies
- identifies review points
- keeps steps small enough to verify

The decomposition step should be performed by a **Planner / Task Splitter agent** when the task is non-trivial.

Planner output must include:

- priority
- task reason / why this exists
- requirements
- test plan
- acceptance criteria
- dependencies
- owner / reviewer if known

Example:

1. gather context
2. draft solution
3. validate against constraints
4. review output
5. finalize result

### 3. Select agents

Choose agents by layer:

- **Coordinator**: owns intake, decomposition, routing
- **Planner / Task Splitter**: turns product intent into executable subtasks
- **Specialist agent**: performs the work
- **Reviewer agent**: checks output against requirements
- **Template owner**: updates prompts/templates after pilot feedback

Selection rules:

- use the smallest capable agent
- route by skill, not by habit
- add a reviewer when the task is risky, ambiguous, or high-impact
- do not assign more agents than the task needs

### 4. Execute and log every step

Log each step as it happens.

Each log entry must include:

- timestamp in UTC (`ISO 8601`)
- actor / agent name
- step name
- action taken
- current status
- result or observation
- elapsed time since start
- blockers or handoff needs

### 5. Capture result

When the task ends, record:

- what was completed
- what remains
- whether the result met the request
- artifacts produced
- follow-up actions

### 6. Collect feedback

After review, capture feedback in plain language:

- what worked
- what failed
- what was unclear
- what should change next time

### 7. Update agents/templates after a pilot

After a pilot run, review the execution history and update:

- agent instructions
- routing rules
- step templates
- logging fields
- review checklist

Only change the template after the pilot evidence is written down.

## Required execution fields

```yaml
task_id: TSK-1042
request: "Summarize pilot feedback from layered agent execution"
requested_by: "ops@relayhq.com"
coordinator: "agent-coordinator"
planner: "task-splitter-agent"
specialists:
  - "research-agent"
  - "writer-agent"
reviewer: "qa-agent"
difficulty: 3
started_at: "2026-04-10T14:03:12Z"
ended_at: "2026-04-10T14:18:41Z"
elapsed: "15m29s"
status: "done"
result: "Completed with one clarification needed"
feedback:
  - "Step logs were clear"
  - "Difficulty rating was too coarse for mixed tasks"
follow_up:
  - "Add optional sub-ratings for research vs writing"
task_breakdown:
  - id: TSK-1042-1
    title: "Gather execution history"
    priority: "high"
    reason: "Need evidence before adjusting templates"
    requirements:
      - "Include timestamps"
      - "Include step logs"
    tests:
      - "History completeness check"
  - id: TSK-1042-2
    title: "Draft feedback summary"
    priority: "medium"
    reason: "Need human-readable summary for review"
    requirements:
      - "Mention what worked"
      - "Mention what failed"
    tests:
      - "Summary matches log"
```

## Difficulty rating

Use a 1–5 rating:

- **1** = trivial, low risk
- **2** = simple, few dependencies
- **3** = moderate, needs coordination
- **4** = complex, needs review
- **5** = high risk, multi-agent, high uncertainty

## Step log format

Use one line per step.

```text
2026-04-10T14:03:12Z | coordinator | intake | accepted task | elapsed=00m00s
2026-04-10T14:05:01Z | coordinator | decomposition | split into 4 steps | elapsed=01m49s
2026-04-10T14:09:22Z | research-agent | execution | gathered context | elapsed=06m10s
2026-04-10T14:16:30Z | qa-agent | review | approved with note | elapsed=13m18s
2026-04-10T14:18:41Z | coordinator | closeout | result captured | elapsed=15m29s
```

## Minimum audit trail

Every task should preserve:

- who did what
- when they did it
- how long it took
- what changed after each step
- what feedback was captured
- what was updated after the pilot

## Task quality rule

Each task should be explicit enough to answer:

- Why does this task exist?
- What is the priority?
- What are the requirements?
- How will we test it?
- What does done look like?

If those answers are missing, the Planner / Task Splitter should break the task down further before execution.

## Boundaries / non-goals

- not a hidden agent autopilot
- not free-form chat logs
- not a replacement for task ownership
- not a template that changes silently
- not a scorecard without evidence

## Pilot update rule

After the pilot, update the protocol only if the logs show a repeatable improvement.

Good reasons to update:

- a step is consistently unnecessary
- a missing field blocks review
- the difficulty scale is too blunt
- a reviewer catches repeated errors
- a template change improves traceability

If the pilot result is unclear, keep the current template and gather more runs.
