# Vault Structure

RelayHQ uses a **vault-first** repository as the shared source of truth for coordination data.

## Principles
- one object per file
- Markdown for human readability
- YAML frontmatter for machine-readable metadata
- Git for history, review, and merge control
- shared state in the vault, private overlays outside shared commits

## Recommended layout

```text
vault/
├─ shared/
│  ├─ workspaces/
│  ├─ projects/
│  ├─ boards/
│  ├─ columns/
│  ├─ issues/
│  ├─ agents/
│  ├─ runs/
│  ├─ audit/
│  └─ threads/
├─ users/
│  └─ <user>/
│     ├─ provider.md
│     ├─ prefs.md
│     └─ scratch/
└─ system/
   ├─ schemas/
   └─ templates/
```

## Shared vs private

### Shared vault
Committed to Git and visible to the team.

Examples:
- projects
- tasks / issues
- assignments
- approvals
- audit notes
- agent definitions
- run logs

### Private overlay
Per-user settings and secrets references.

Examples:
- provider choice
- model defaults
- routing preferences
- local preferences
- scratch notes

## Git and security rules
- private overlays must be gitignored
- secrets never live in shared files
- provider keys are references only, never raw values
- schema validation should run before commit/push

## Conflict rule
If multiple agents may edit the same task, the vault protocol must support locking, heartbeats, and stale detection.

## Source of truth rule
RelayHQ reads the vault to build current board and project state.

The vault is not a cache; it is the canonical record.
