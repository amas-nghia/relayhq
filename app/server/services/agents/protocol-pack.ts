import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type RelayHQRuntime = "claude-code" | "cursor" | "antigravity" | "opencode" | "codex";

export interface ProtocolPackOptions {
  readonly baseUrl: string;
  readonly vaultRoot: string;
  readonly agentId: string;
  readonly cwd: string;
}

export interface ProtocolPackTarget {
  readonly runtime: RelayHQRuntime;
  readonly path: string;
  readonly append: boolean;
}

export interface ProtocolPackResult {
  readonly runtime: RelayHQRuntime;
  readonly path: string;
  readonly content: string;
  readonly appended: boolean;
}

export const PROTOCOL_PACK_TARGETS: Record<RelayHQRuntime, ProtocolPackTarget> = {
  "claude-code": { runtime: "claude-code", path: "CLAUDE.md", append: true },
  cursor: { runtime: "cursor", path: ".cursor/rules/relayhq.mdc", append: false },
  antigravity: { runtime: "antigravity", path: ".antigravity/instructions/relayhq.md", append: false },
  opencode: { runtime: "opencode", path: ".opencode/agents/relayhq.md", append: false },
  codex: { runtime: "codex", path: ".codex/instructions/relayhq.md", append: false },
};

// Runtimes that support MCP — use tool names instead of raw HTTP
const MCP_RUNTIMES = new Set<RelayHQRuntime>(["claude-code", "cursor", "antigravity"]);

function requireRuntime(runtime: string): RelayHQRuntime {
  if (runtime in PROTOCOL_PACK_TARGETS) {
    return runtime as RelayHQRuntime;
  }

  throw new Error(`Unknown runtime: ${runtime}`);
}

// ─── MCP skill (Claude Code / Cursor / Antigravity) ──────────────────────────

function buildMcpSkill(runtime: RelayHQRuntime, options: ProtocolPackOptions): string {
  const { agentId, baseUrl } = options;

  return `## RelayHQ

RelayHQ is the task coordination layer for this project.
It tracks what you own, your progress, and human approval gates.
Server: ${baseUrl} · Your agent ID: \`${agentId}\`

### Workflow

| When | Call |
|------|------|
| Start of every session | \`relayhq_inbox(agentId="${agentId}")\` |
| Picking up a task | \`relayhq_start(agentId="${agentId}", taskId="task-xxx")\` |
| Every 5–10 min while working | \`relayhq_progress(agentId="${agentId}", taskId, progress=N, notes="...")\` |
| Work complete | \`relayhq_done(agentId="${agentId}", taskId, result="One-line summary")\` |
| Stuck / missing info | \`relayhq_blocked(agentId="${agentId}", taskId, reason="What's missing")\` |

### Session start rules

1. Call \`relayhq_inbox\` — check \`active\` first. If a task is already in progress, **resume it**.
2. Otherwise pick the highest-priority task from \`inbox\` (assigned to you) or \`pool\` (unassigned).
3. Call \`relayhq_start\` to claim and get full context: \`objective\`, \`acceptance_criteria\`, \`context_files\`, \`constraints\`.

### Hard rules

- **Never mark a task "done" yourself.** \`relayhq_done\` moves it to "review" — a human approves the final step.
- **Heartbeat keeps your lock.** Tasks idle for 30 min are auto-reclaimed. \`relayhq_progress\` resets the timer.
- **Approval gate.** If the task has \`approval_needed: true\`, call \`relayhq_request_approval\` before the risky action.
- Do not read vault Markdown files directly — use the API.
- Claim before starting; do not work on unclaimed tasks.
`;
}

// ─── HTTP skill (OpenCode / Codex / CLI agents) ───────────────────────────────

function buildHttpSkill(runtime: RelayHQRuntime, options: ProtocolPackOptions): string {
  const { agentId, baseUrl } = options;
  const enc = encodeURIComponent(agentId);

  return `## RelayHQ — Agent Protocol

RelayHQ is the task coordination layer for this project.
Server: ${baseUrl} · Your agent ID: \`${agentId}\`

### 1. Session start (every session)

\`\`\`
GET ${baseUrl}/api/agent/state?agentId=${enc}
\`\`\`

Response shape:
\`\`\`json
{
  "active": { "id": "task-xxx", "title": "...", "progress": 40 },
  "inbox":  [ { "id": "task-yyy", "priority": "high", "title": "..." } ],
  "pool":   [ { "id": "task-zzz", "priority": "medium", "title": "..." } ]
}
\`\`\`

- **active** → resume this task first (already claimed by you).
- **inbox** → assigned to you; pick by priority.
- **pool** → unassigned; claim before another agent does.

### 2. Claim + get full context

\`\`\`
POST ${baseUrl}/api/vault/tasks/{taskId}/claim
{"actorId": "${agentId}"}
\`\`\`

Then fetch the bootstrap pack for objective, acceptance criteria, and context:

\`\`\`
GET ${baseUrl}/api/agent/bootstrap/{taskId}?agentId=${enc}
\`\`\`

Returns: \`title\`, \`objective\`, \`acceptance_criteria\`, \`context_files\`, \`constraints\`, \`priority\`.

### 3. Heartbeat (every 5–10 min)

\`\`\`
POST ${baseUrl}/api/vault/tasks/{taskId}/heartbeat
{"actorId": "${agentId}"}
\`\`\`

Tasks idle for 30 min are auto-reclaimed. Keep this running while working.

### 4. Progress update

\`\`\`
PATCH ${baseUrl}/api/vault/tasks/{taskId}
{"actorId": "${agentId}", "patch": {"progress": 60, "execution_notes": "Completed X. Working on Y."}}
\`\`\`

\`progress\` is 0–100. \`execution_notes\` replaces the previous note each time.

### 5a. Done — move to review

\`\`\`
PATCH ${baseUrl}/api/vault/tasks/{taskId}
{"actorId": "${agentId}", "patch": {"status": "review", "result": "What was done and where to look."}}
\`\`\`

**Never set status to "done" directly.** "review" is the agent's final state — a human approves from there.

### 5b. Blocked

\`\`\`
PATCH ${baseUrl}/api/vault/tasks/{taskId}
{"actorId": "${agentId}", "patch": {"status": "blocked", "blocked_reason": "Need X before I can continue."}}
\`\`\`

### 5c. Request human approval

\`\`\`
POST ${baseUrl}/api/vault/tasks/{taskId}/request-approval
{"actorId": "${agentId}", "reason": "About to do Y — need sign-off."}
\`\`\`

Stop and wait. Do not proceed until the approval response comes back.

### Hard rules

- Resume \`active\` before claiming new tasks.
- Never set status "done" — use "review".
- Heartbeat at least every 10 min or your lock expires.
- Do not read vault Markdown files directly.
- Claim pool tasks before starting work on them.
`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AgentSkillOptions {
  readonly agentId: string;
  readonly baseUrl: string;
}

/** Skill file content written into every agent's vault skill file at creation time. */
export function buildAgentSkillFile(options: AgentSkillOptions): string {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const agentId = options.agentId.trim();
  return buildHttpSkill("opencode", { agentId, baseUrl, vaultRoot: "", cwd: "" });
}

export function buildProtocolPack(runtime: string, options: ProtocolPackOptions): string {
  const normalizedRuntime = requireRuntime(runtime);
  const agentId = options.agentId.trim().length > 0 ? options.agentId.trim() : normalizedRuntime;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const vaultRoot = options.vaultRoot.trim();
  const opts: ProtocolPackOptions = { ...options, agentId, baseUrl, vaultRoot };

  return MCP_RUNTIMES.has(normalizedRuntime)
    ? buildMcpSkill(normalizedRuntime, opts)
    : buildHttpSkill(normalizedRuntime, opts);
}

export async function setupProtocolPack(runtime: string, options: ProtocolPackOptions): Promise<ProtocolPackResult> {
  const normalizedRuntime = requireRuntime(runtime);
  const target = PROTOCOL_PACK_TARGETS[normalizedRuntime];
  const filePath = join(options.cwd, target.path);
  const marker = "## RelayHQ";
  const content = buildProtocolPack(normalizedRuntime, options);

  await mkdir(dirname(filePath), { recursive: true });

  try {
    const existing = await readFile(filePath, "utf8");
    if (existing.includes(marker)) {
      return { runtime: normalizedRuntime, path: filePath, content: existing, appended: false };
    }

    const next = `${existing.trimEnd()}\n\n${content}`;
    await writeFile(filePath, next, "utf8");
    return { runtime: normalizedRuntime, path: filePath, content: next, appended: true };
  } catch {
    await writeFile(filePath, content, "utf8");
    return { runtime: normalizedRuntime, path: filePath, content, appended: true };
  }
}
