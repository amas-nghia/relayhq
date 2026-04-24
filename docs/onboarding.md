# Onboarding Flow

## Goal

Reduce the two main first-run barriers for RelayHQ:

- **Setup friction** — Bun, PM2, env vars, vault path choices
- **Concept friction** — vaults, Markdown files, frontmatter, task claim semantics

The onboarding flow lets a new user create a working board in the UI first, then connect their AI agent or CLI — in that order. Concepts are taught after value is delivered.

## Trigger

Show onboarding wizard when any of these are true:

- `/api/settings` reports an invalid vault root
- there are no available workspaces
- there are no projects yet

Hide onboarding once a project exists and the wizard has been completed (step 3 dismissed).

---

## Step 1: Workspace

### Primary path — Create new vault

- **Title:** `Set up your first RelayHQ workspace`
- **Fields:**
  - `Workspace name` (default: "My Workspace")
  - `Vault path` (with directory browser)
- **CTA:** `Create workspace`
- **Backend:** `POST /api/vault/init`

### Alternate path — Use existing vault

- **Toggle:** `Use existing vault`
- **Fields:**
  - `Existing vault path` (with directory browser)
- **CTA:** `Connect vault`
- **Backend:** `POST /api/settings`

### Rules

- Do not mention YAML or frontmatter in the form
- Surface backend validation errors inline
- Explain that RelayHQ writes vault files for the user — they can inspect or edit them later

---

## Step 2: Project

- **Fields:**
  - `Project name` (required)
  - `Codebase path` (optional — path to the repo the agent will work in)
- **CTA:** `Create first project`
- **Backend:** `POST /api/vault/projects`
- **Expected result:** one project, one board, four default columns (Todo / In Progress / Review / Done)

---

## Step 3: Connect agent

This step replaces the earlier "create first task" step. Creating a task is a natural follow-on action once the board is open — the onboarding should end by connecting the agent instead.

### Tab A: Claude Code

Instructions for adding RelayHQ to `~/.claude/settings.json` (MCP config). One-time setup; all Claude Code sessions will have `relayhq_*` tools available automatically.

```json
{
  "mcpServers": {
    "relayhq": {
      "command": "npx",
      "args": ["relayhq-mcp"],
      "env": {
        "RELAYHQ_BASE_URL": "http://127.0.0.1:44210",
        "RELAYHQ_VAULT_ROOT": "<vault-path-from-step-1>"
      }
    }
  }
}
```

- Vault root is injected from the settings saved in Step 1
- Copy button writes to clipboard
- Instructions: copy → paste into `~/.claude/settings.json` → restart Claude Code

### Tab B: CLI / Shell

Instructions for exporting RelayHQ env vars into the shell profile. One-time setup; all future terminal sessions will have the CLI ready.

```sh
export RELAYHQ_BASE_URL="http://127.0.0.1:44210"
export RELAYHQ_VAULT_ROOT="<vault-path-from-step-1>"
```

- "Write to ~/.zshrc" and "Write to ~/.bashrc" buttons call `POST /api/settings/shell-profile`
- Idempotent — running it twice does not duplicate the lines
- Status feedback after write: "Added to ~/.zshrc — run: `source ~/.zshrc`"

### CTA

`Open my board →` — always enabled, dismisses wizard without any API call. The user creates their first task from the board.

---

## Teaching the Model

The wizard header area should explain in plain language (2–3 sentences):

- RelayHQ is vault-first: the UI writes Markdown files on your behalf
- You can stay in the UI, or open `vault/shared/tasks/*.md` in your editor later
- Both humans and AI agents read and write the same files

This keeps the model visible without forcing file concepts before the user has value.

---

## UX Constraints

- One clear job per step
- Visible step progress: `Step 1 of 3`
- No dead ends when a valid existing vault already contains data
- Step 3 is never "locked" — always skippable via "Open my board"
- Back button available on steps 2 and 3

## Non-Goals

- No full tutorial mode
- No required Git knowledge during first run
- No attempt to hide that RelayHQ is file-backed
