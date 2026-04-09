# Run Log Template

## Metadata

- Run ID:
- Task ID:
- Task name:
- Objective:
- Request source:
- Owner / reviewer:
- Coordinator:
- Planner / Task Splitter:
- Specialist agents:
- Reviewer:
- Difficulty (1-5):
- Started at (UTC):
- Ended at (UTC):
- Elapsed:

## Task Breakdown

- Task ID:
- Task title:
- Priority:
- Task reason / why:
- Requirements:
- Test plan:
- Acceptance criteria:
- Dependencies:

## Step Log

Use one line per step.

```text
2026-04-10T14:03:12Z | coordinator | intake | accepted task | elapsed=00m00s
2026-04-10T14:05:01Z | coordinator | decomposition | split into 4 steps | elapsed=01m49s
2026-04-10T14:09:22Z | research-agent | execution | gathered context | elapsed=06m10s
2026-04-10T14:16:30Z | qa-agent | review | approved with note | elapsed=13m18s
2026-04-10T14:18:41Z | coordinator | closeout | result captured | elapsed=15m29s
```

## Result

- Status:
- What was completed:
- What remains:
- Did it meet the request:
- Artifacts produced:

## Feedback

- What worked:
- What failed:
- What was unclear:
- What should change next time:

## Follow-up

- Update docs:
- Update agent instructions:
- Update routing rules:
- Update logging fields:
- Update review checklist:
- Update task splitting rules:

## Effectiveness Check

- Did the task breakdown reduce ambiguity:
- Did the testing surface catch issues early:
- Was the priority correct:
- Was the difficulty rating accurate:
- What should be changed next run:
