# UI Fix Issues Log

## Open

### Task-management router script missing
- The workflow-referenced path `.opencode/skills/task-management/router.sh` is not present.
- Impact: subtask completion state was updated manually in `.tmp/tasks/ui-fix/*.json`.

## Closed

### UI stale state incorrectly used write-lock logic
- Symptom: recent-heartbeat tasks were shown as stale in the UI.
- Resolution: separated user-facing heartbeat stale detection from write-lock ownership/expiry logic.
