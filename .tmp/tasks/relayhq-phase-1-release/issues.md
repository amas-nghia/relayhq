# Phase 1 Issues Log

## Open

### Frontend reviewer identity is manual
- Discovered while implementing approval actions.
- The approval UI currently asks for `actorId` / reviewer identity manually because the app does not yet have a canonical authenticated current-user source.
- Impact: approval actions work, but the UX is temporary and relies on explicit operator input.
- Suggested follow-up: add a small current-operator source for the single-user Phase 1 slice and default action identities from that source.

### Task-management router script missing
- Discovered while subagents attempted to update task state via the referenced router.
- Expected path: `.opencode/skills/task-management/router.sh`
- Impact: task state had to be updated manually in `.tmp/tasks/relayhq-phase-1-release/*.json`.
- Suggested follow-up: either restore the router script or remove references to it from delegation prompts.

## Resolved During Execution

### Task parser required legacy `outcome` field
- Discovered during focused verification for task creation.
- Symptom: newly created tasks failed read-model parsing because `read.ts` looked for `outcome` instead of `approval_outcome` on task records.
- Resolution: updated the vault reader to parse `approval_outcome` for task documents and keep `outcome` only for approval documents.

### Approval lifecycle drifted from linked approval documents
- Discovered during release verification planning.
- Symptom: approve/reject actions updated task frontmatter but left linked `vault/shared/approvals/*.md` records stale, which could keep selectors/UI in a pending state.
- Resolution: added approval-document upsert/sync in the task lifecycle service and verified task + approval state together in focused regression tests.
