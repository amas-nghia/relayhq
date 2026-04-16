# Agent Context: RelayHQ + AI Agent Ecosystem

Short summary. For the full context pack, read `docs/agent-context.full.md`.

## 1. RelayHQ

RelayHQ is a **Kanban-first control plane** for agent-assisted project work.

### Purpose
- Manage projects, boards, tasks, ownership, approvals, progress, and audit history.
- Provide accountable coordination across humans and agents.
- Keep traceability and visibility higher than raw automation.

### Phase 1 scope
- project registry
- task board
- board / column flow
- human and agent assignment
- approvals
- audit notes

### Non-goals
- full automation platform
- marketplace for third-party agents
- advanced analytics
- billing

### Tech stack
- Frontend/app: Nuxt 3 + Vue 3 + TypeScript + Bun
- Repo shape: Nuxt app + vault-first coordination repo
- Current storage: in-memory scaffold

### Core boundary
RelayHQ is the **control plane**, not the agent runtime.

### Discovery helper
- Use `docs/agents/contextscout-template.md` when you only need file discovery and handoff.
- ContextScout is discovery-only; do not use it for planning or implementation.

---

## 2. claude-code-agents-ui

`claude-code-agents-ui` is a **Nuxt 3 + Vue 3 visual dashboard** for Claude Code.

### Purpose
- Visually manage Claude Code agents, commands, skills, workflows, and plugins.
- Provide a local GUI over the `~/.claude` directory.
- Include relationship graphs, terminal emulation, chat, workflow building, and real-time metrics.

### Tech stack
- Nuxt 3
- Vue 3
- TypeScript
- Bun (recommended)
- Nitro server routes
- WebSocket + SSE
- `@anthropic-ai/claude-agent-sdk`
- `@modelcontextprotocol/sdk`
- `node-pty`, `ws`, `chokidar`, `yaml`, `marked`, `shiki`
- UI: `@nuxt/ui`, `@vue-flow/*`, `xterm.js`

### Shape
- UI and server live in one app.
- The app reads/writes local Claude config files.
- It is a local dashboard, not a generic SaaS backend.

---

## 3. Kioku / kioku-lite

Kioku is a **local-first memory engine** for AI agents.

### Purpose
- Store long-term memory for agents.
- Improve recall, context, and causality.
- Support reflective workflows, journaling, and agent memory.

### Main ideas
- CLI/skills-based integration
- write/search workflow
- knowledge graph for entity/relationship memory
- tri-hybrid retrieval:
  - BM25 / FTS
  - vector search
  - knowledge graph

### Role in the ecosystem
Kioku is the **memory layer**.

---

## 4. Outer Harness

Outer Harness is the **organizational layer around agents**.

### What it includes
- process-centric workflow
- structured data capture
- cost attribution
- task tracking
- quality gates
- audit and analytics
- context and skill governance

### What it is not
- not the agent model itself
- not the inner runtime harness
- not just prompts or chat logs

### Core principle
Human and agent are nodes in the same pipeline; the process governs both.

---

## 5. Company agent-transformation stages

The observed company journey has 5 stages:

1. **Cá nhân tự dùng AI** — everyone uses tools differently.
2. **Agentic Working & đóng gói skill** — teams start packaging reusable workflows/skills.
3. **Gom lại một chỗ để dùng chung** — shared knowledge/data/context begins.
4. **Loạn credentials và bảo mật** — keys, permissions, and access become hard to manage.
5. **Agent Brain / one gateway** — one central hub for access, audit, and observability.

### Practical reading
- Most companies are in stages 1–2.
- Stage 3 introduces shared context and reuse.
- Stage 4 is where governance pain becomes obvious.
- Stage 5 is the target operating model.

---

## 6. Recommended system decomposition

### Control plane
Use **RelayHQ** for:
- task intake
- board state
- approvals
- audit trail
- ownership and coordination

### Memory
Use **Kioku** for:
- long-term memory
- knowledge graph
- searchable context

### Visual runtime / dashboard
Use **claude-code-agents-ui** for:
- visual agent management
- terminal/chat/graph UI
- local Claude Code integration

### Governance layer
Use **Outer Harness** concepts for:
- policy
- permissions
- observability
- metrics
- quality gates

---

## 7. Source docs

Primary sources to read next:
- `README.md`
- `docs/vision.md`
- `docs/architecture.md`
- `docs/scope/phase-1.md`
- `docs/specs/vault-first-platform.md`
- `docs/domain/model.md`
- `docs/workflows/agent-execution-protocol.md`
- `docs/decisions/log.md`
- `docs/runs/template.md`

External/related references:
- `claude-code-agents-ui/README.md`
- `claude-code-agents-ui/CLAUDE.md`
- Obsidian clipping: `Công ty bạn đang ở giai đoạn nào trên hành trình chuyển đổi sang làm việc với AI Agent?`
- Substack: Kioku article
- Substack: Outer Harness article
