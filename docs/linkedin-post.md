# LinkedIn Post — RelayHQ Launch

---

I'm building something in public and sharing it early — because I'd rather get real feedback now than ship something perfect that nobody needs.

**RelayHQ is a work in progress.** The core works and I use it daily, but there's plenty still rough around the edges. That's exactly why I'm posting now.

---

**The problem:**

I was running Claude Code, then added another agent, then another. And things started breaking down in ways I didn't expect:

— No visibility into what each agent was actually doing
— Two agents working on the same task simultaneously
— Agents making changes nobody approved
— Work completed with no record of what happened or who signed off

I looked for tools that solved this. Nothing fit. So I built one.

---

**Introducing RelayHQ** — an open-source coordination layer for human + AI agent teams.

The core idea is simple: you manage the task queue, RelayHQ handles the rest.

→ Create a task with acceptance criteria
→ RelayHQ routes it to the right agent and locks it — no double-claiming
→ Agent works, sends heartbeats every 10 minutes
→ Needs human sign-off? Agent pauses and waits — nothing moves forward without approval
→ Done. Written to vault. Committed to Git. Full audit trail.

---

**What makes it different:**

Every task is a plain Markdown file in your Git repo. No database. No external service. No vendor lock-in. If you stop using RelayHQ tomorrow, your data is still there — readable, versionable, yours.

It works natively with Claude Code, Cursor, and OpenCode via MCP — six tools that give agents a structured protocol for claiming work, reporting progress, requesting approval, and signaling blockers.

---

**Getting started is one command:**

```
git clone https://github.com/amas-nghia/relayhq
cd relayhq
pm2 start ecosystem.config.cjs
```

A 3-step onboarding wizard runs at localhost:44211 and walks through vault setup and agent connection.

---

**Tech:**
Nuxt 3 + Bun for the API, React 19 + Vite for the board UI, plain Markdown as the storage layer, MCP server for Claude Code / Cursor / Antigravity.

MIT license. Runs fully local. No data leaves your machine.

---

**This is early. Rough edges exist. That's the point.**

I'm sharing now because the best feedback comes from people actually running into the problem — not from waiting until everything is polished.

If you're working with AI agents and coordination is becoming the bottleneck, I'd love for you to try it. And more importantly — tell me what's missing, what's broken, and what you'd prioritize instead.

What problems are you running into with AI agents that RelayHQ doesn't solve yet? Drop a comment or reach out directly. Every piece of feedback shapes where this goes next.

🔗 github.com/amas-nghia/relayhq
📖 amas.gitbook.io/relayhq
🎥 Demo: https://www.loom.com/share/496c1d58c33a435f826ad8f620191eab

---

#AIAgents #OpenSource #DeveloperTools #ClaudeCode #SoftwareEngineering #BuildInPublic
