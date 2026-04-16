# RelayHQ Docs

RelayHQ’s canonical documentation hub.

## Read first
1. `README.md`
2. `docs/vision.md`
3. `docs/architecture.md`
4. `docs/vault/structure.md`
5. `docs/vault/schema.md`
6. `docs/agents/definitions.md`
7. `docs/agents/protocol.md`
8. `docs/roadmap.md`

## Canonical docs

| Topic | Canonical doc |
|---|---|
| Product overview | `README.md` |
| Product vision | `docs/vision.md` |
| System boundaries | `docs/architecture.md` |
| Vault structure | `docs/vault/structure.md` |
| Vault schema | `docs/vault/schema.md` |
| Agent registry | `docs/agents/definitions.md` |
| Agent registry usage protocol | `docs/agents/protocol.md` |
| Agent protocol | `docs/agents/protocol.md` |
| ContextScout prompt template | `docs/agents/contextscout-template.md` |
| Roadmap | `docs/roadmap.md` |
| Agent memory / context summary | `docs/agent-context.md` |
| Agent memory / full context | `docs/agent-context.full.md` |
| RelayHQ build plan | `docs/relayhq-build-plan.md` |

## Source of truth rule
- Vault file shape lives in `docs/vault/*`.
- Agent behavior lives in `docs/agents/*`.
- Product direction lives in `README.md`, `docs/vision.md`, and `docs/architecture.md`.
- If docs conflict, the more specific doc wins.

## For agents
- Prefer canonical docs over memory.
- If a change affects schema or protocol, update `docs/vault/*` or `docs/agents/*` first.
- If a change affects product direction, update `README.md` and `docs/vision.md`.
