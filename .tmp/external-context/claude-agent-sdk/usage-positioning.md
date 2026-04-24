---
source: Context7 API
library: Claude Agent SDK
package: claude-agent-sdk
topic: usage-positioning
fetched: 2026-04-13T00:00:00Z
official_docs: https://platform.claude.com/docs/en/agent-sdk/overview
---

## Claude Agent SDK positioning

- TypeScript/Python SDK for building production agents.
- Optimized for custom applications, CI/CD, and automation—not just ad hoc prompting.
- Shares core capabilities with Claude Code: file reading, command execution, web search, editing, agent loop, and context management.
- Supports streaming `query(...)` flows, one-shot queries, custom tools, hooks, and plugins.
- By default it runs in isolation mode and loads no filesystem settings unless configured.

## Relevant excerpts

```ts
for await (const message of query({ prompt, options: { maxTurns: 1 } })) {
  if (message.type === 'result') console.log(message.result)
}
```

```ts
options: {
  hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [myCallback] }] },
  allowedTools: ['Read', 'Edit', 'Bash']
}
```

## Notes for analysis

- Best treated as an agent runtime/integration layer, not a UI library.
- Especially relevant when the app needs local tool access, hooks, or MCP-style extensibility.
