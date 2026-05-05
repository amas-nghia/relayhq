# Vault Structure

The vault is the source of truth. Everything is a file.

## Directory layout

```
vault/
├── shared/                         # Committed to Git. Team source of truth.
│   ├── workspaces/                 # ws-{id}.md
│   ├── projects/                   # project-{id}.md
│   ├── boards/                     # board-{id}.md
│   ├── columns/                    # col-{id}.md
│   ├── tasks/                      # task-{id}.md
│   ├── agents/                     # agent-{id}.md
│   ├── docs/                       # doc-{id}.md
│   ├── audit/                      # audit-{id}.md
│   ├── coordinator-threads/        # coordinator-thread-{project_id}.md
│   └── threads/                    # agent-session-{session_id}.jsonl
└── users/                          # Per-user private files. Must be gitignored.
    └── {username}/
        ├── provider.md             # API provider preferences
        └── prefs.md                # Personal preferences
```

## Shared vs private

**Shared** (`vault/shared/`) is committed to Git and is the canonical record for the whole team. It contains tasks, projects, boards, agents, audit notes, and session transcripts.

**Private** (`vault/users/`) is per-user and must never be committed. It holds provider credentials references, personal routing preferences, and scratch files. Add `vault/users/` to `.gitignore`.

## Rules

- One object per file
- YAML frontmatter for machine-readable fields, Markdown body for human-readable content
- Never write vault files directly from application code — all writes go through the API
- Secrets never appear in vault files — use `api_key_ref: env:VAR_NAME` references only
- `vault/users/**` must not appear in shared commits

## Session transcript files

Agent session events are streamed to `.jsonl` files:

```
vault/shared/threads/agent-session-{session_id}.jsonl
```

Each line is a JSON object with an `event` type and payload. These are written by the launch pipeline and read by the analytics system. Do not write or modify them manually.

## Vault root location

By default, the API server locates the vault relative to the repo root. Override with the `RELAYHQ_VAULT_ROOT` env var to point at an external vault (e.g., an Obsidian vault on another path).

```bash
RELAYHQ_VAULT_ROOT=/home/user/Documents/MyVault bun run dev
```
