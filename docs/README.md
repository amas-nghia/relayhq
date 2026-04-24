# Introduction

**RelayHQ** is a vault-first Kanban control plane for humans and AI agents.

Your task board lives in Markdown files committed to Git. No Postgres. No Redis. No proprietary database. Every task, approval, and audit note is a plain `.md` file with YAML frontmatter — readable by humans, queryable by machines, versioned by Git.

## The core idea

Most coordination tools treat the database as the source of truth. RelayHQ treats Git as the source of truth.

When an agent completes a task, it writes a Markdown file. When a human approves an action, it updates a Markdown file. When something needs audit, it creates a Markdown file. All of it is in your repository. All of it is in your history.

## Who it is for

RelayHQ is for teams that:

- use AI agents in real work alongside humans
- need clear ownership, approval gates, and audit trails
- want coordination state that survives context loss and model upgrades
- prefer self-hosted, inspectable infrastructure over black-box SaaS

## How it works

1. **Tasks** live in `vault/shared/tasks/` as Markdown files
2. The **Nuxt API** (port 4310) reads and writes those files
3. The **React web UI** (port 3001) renders the Kanban board
4. **Agents** interact via CLI or HTTP — claim tasks, send heartbeats, request approvals, mark done
5. **Git** preserves the full history of every state change

## What RelayHQ coordinates

| Concern | RelayHQ handles |
|---------|----------------|
| Task ownership | Who has claimed what |
| Workflow state | Which column a task is in |
| Approval gates | Human sign-off before risky actions |
| Audit trail | What happened, when, and why |
| Agent registration | What each agent can do |
| Progress tracking | Heartbeats and completion notes |

## What RelayHQ does not do

RelayHQ is the **control plane**, not the **execution layer**.

It does not run models. It does not manage prompts. It does not execute agent code. Those belong in your agent runtime (Claude Code, OpenAI Assistants, a custom loop). RelayHQ coordinates the work around that runtime.

## Next steps

- [Quick Start](getting-started.md) — get a board running in 5 minutes
- [Architecture](architecture.md) — understand the three-layer model
- [Agent Protocol](agents/protocol.md) — integrate your agent
- [Vault Schema](vault/schema.md) — understand the file format
