# Contributing Guide

Thanks for wanting to contribute!

We appreciate both small targeted fixes and well-considered larger changes.

---

## Two Paths to Get Your PR Accepted

### Path 1: Small, Focused Changes _(fastest way to get merged)_

- Pick **one** clear thing to fix or improve
- Touch the **smallest possible number of files**
- All tests pass and CI is green
- Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md)

These get merged quickly when they're clean.

### Path 2: Larger or Impactful Changes

- **First** open a [GitHub Discussion](https://github.com/amas-nghia/RelayHQ/discussions) or issue
  - Describe what problem you're solving
  - Share your rough approach
- Once there's rough agreement, build it
- Your PR must include:
  - Clear description of what and why
  - Before / after screenshots for UI changes
  - Manual testing notes
  - All tests passing and CI green
  - [PR template](.github/PULL_REQUEST_TEMPLATE.md) fully filled out

PRs that follow this path are **much** more likely to be accepted, even when large.

---

## PR Requirements (all PRs)

### Use the PR Template

Every pull request must follow the PR template. The template includes: **Thinking Path**, **What Changed**, **Verification**, **Risks**, and a **Checklist**.

### Tests Must Pass

Run tests locally before pushing. CI must be green before a PR is merged.

```bash
# API server tests
cd app && bun test

# Go schema validation tests
cd backend && go test ./...

# Web type check
cd web && npm run lint
```

### One Logical Change Per PR

Keep PRs focused. If you're fixing two unrelated things, open two PRs. Small, reviewable diffs ship faster.

---

## Feature Contributions

We actively manage the RelayHQ roadmap.

Uncoordinated feature PRs may be closed even when the implementation is thoughtful — this is about roadmap coherence and long-term maintenance, not a judgment on your effort.

If you want to contribute a feature:

- Check [docs/roadmap.md](docs/roadmap.md) first
- Start the discussion in [GitHub Issues](https://github.com/amas-nghia/RelayHQ/issues) before writing code
- If it fits within existing APIs or vault schema, that path is easier to merge

Bug fixes, documentation improvements, and small targeted improvements are always welcome and the fastest path to getting merged.

---

## General Rules

- Write clear, descriptive commit messages (`feat:`, `fix:`, `docs:`, `chore:`)
- One PR = one logical change
- Run tests locally first
- Be kind in discussions

---

## Writing a Good PR Description

Your PR description must follow the [PR template](.github/PULL_REQUEST_TEMPLATE.md). The **Thinking Path** section at the top is required — it explains from the top of the project down to the specific thing you changed. This helps reviewers quickly understand context without digging through the code.

### Thinking Path — Example 1

> - RelayHQ is a task coordination layer for human + AI agent teams
> - Agents interact with tasks via MCP tools or the HTTP API
> - When an agent calls `relayhq_done`, the task moves to "review" and waits for human approval
> - But agents working on long tasks had no way to signal partial progress without sending a full heartbeat
> - So this PR adds a `progress` field to `relayhq_progress` so agents can report percentage completion separately from the heartbeat timestamp
> - This lets the board show a real progress bar without requiring a separate API call

### Thinking Path — Example 2

> - RelayHQ stores all task state as Markdown files in a Git vault
> - The web UI reads the board state via `/api/vault/read-model`
> - Multiple agents working in parallel can claim tasks — RelayHQ uses lock fields to prevent double-claiming
> - But stale locks (agent crashed) were not expiring correctly when the `lock_expires_at` field was missing
> - So this PR adds a fallback expiry of 30 minutes from `locked_at` when `lock_expires_at` is absent
> - This prevents tasks from being permanently locked after an agent crash

After the Thinking Path, include: what you changed, why it matters, how to verify it works, and any risks or edge cases.

Screenshots are strongly encouraged for any visible UI change.

---

Questions? Open an issue or start a discussion — happy to help.

Happy hacking!
