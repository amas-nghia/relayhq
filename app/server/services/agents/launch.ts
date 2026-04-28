import { execSync } from "node:child_process";
import { resolve } from "node:path";

import { createError } from "h3";

import type { VaultReadModel } from "../../models/read-model";
import { readCanonicalVaultReadModel } from "../vault/read";
import { resolveVaultWorkspaceRoot } from "../vault/runtime";
import { claimTaskLifecycle, heartbeatTaskLifecycle, patchTaskLifecycle } from "../vault/task-lifecycle";
import { appendAgentSessionEvent } from "./session-events";
import { agentRunnerManager, type AgentRunner } from "../runners/manager";
import { readTaskBootstrapPack, type BootstrapPack } from "../../api/agent/bootstrap/[taskId].get";

const DEFAULT_SESSION_HEARTBEAT_MS = 30_000

export interface LaunchAgentSessionRequest {
  readonly agentId: string;
  readonly taskId: string;
  readonly mode?: 'fresh' | 'resume';
  readonly surface?: 'background' | 'visible-terminal';
  readonly previousSessionId?: string | null;
  readonly vaultRoot?: string;
}

export interface LaunchAgentSessionResult {
  readonly agentId: string;
  readonly taskId: string;
  readonly sessionId: string;
  readonly runnerId: string;
  readonly runtimeKind: string;
  readonly launchSurface: 'background' | 'visible-terminal';
  readonly launchMode: 'fresh' | 'resume';
  readonly command: string;
  readonly args: ReadonlyArray<string>;
}

function createSessionId(): string {
  return `runner-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function ensureCommandAvailable(command: string): string {
  try {
    const path = execSync(`command -v ${command}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (path.length === 0) throw new Error("missing command");
    return path;
  } catch {
    throw createError({ statusCode: 422, statusMessage: `${command} CLI was not found on PATH.` });
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function wrapCommandForPty(command: string, args: ReadonlyArray<string>): { command: string; args: string[] } {
  return {
    command: 'script',
    args: ['-qec', [command, ...args.map(shellQuote)].join(' '), '/dev/null'],
  }
}

function ensureVisibleTerminalAvailable(): string {
  if (process.platform !== 'linux') {
    throw createError({ statusCode: 422, statusMessage: 'Visible terminal launch is currently supported only on Linux.' })
  }
  return ensureCommandAvailable('x-terminal-emulator')
}

async function buildBootstrapPrompt(taskId: string, vaultRoot: string, agentId: string): Promise<string> {
  const pack = await readTaskBootstrapPack(taskId, {
    resolveRoot: () => vaultRoot,
    includeProtocol: true,
    inlineContextFiles: true,
    agentId,
  });

  const sections: string[] = [
    `TASK: ${pack.task.title}`,
    `ID: ${pack.task.id}`,
    `Priority: ${pack.task.priority} | Status: ${pack.task.status}`,
  ];

  if (pack.objective) {
    sections.push(`\n## Objective\n${pack.objective}`);
  }

  if (pack.acceptanceCriteria.length > 0) {
    sections.push(`\n## Acceptance Criteria\n${pack.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}`);
  }

  if (pack.constraints.length > 0) {
    sections.push(`\n## Constraints\n${pack.constraints.map(c => `- ${c}`).join('\n')}`);
  }

  if (pack.contextFileContents) {
    const entries = Object.entries(pack.contextFileContents);
    if (entries.length > 0) {
      sections.push(`\n## Context Files`);
      for (const [path, content] of entries) {
        sections.push(`### ${path}\n\`\`\`\n${content}\n\`\`\``);
      }
    }
  }

  if (pack.skills.length > 0) {
    sections.push(`\n## Skills\n${pack.skills.map(s => `### ${s.name}\n${s.content}`).join('\n\n')}`);
  }

  if (pack.protocolInstructions) {
    const base = process.env.RELAYHQ_BASE_URL ?? 'http://127.0.0.1:44210';
    sections.push(`\n## Protocol\nRELAYHQ_BASE_URL: ${base}\nVAULT_ROOT: ${vaultRoot}\nAGENT_ID: ${agentId}\n\nUse actorId exactly as ${agentId} for all RelayHQ API calls.\n\n${pack.protocolInstructions}`);
  }

  return sections.join('\n');
}

function appendResumeInstructions(prompt: string, previous: AgentRunner | null): string {
  if (previous === null) return prompt;
  return [
    `Resume the previous RelayHQ session ${previous.sessionId} for task ${previous.taskId ?? "unknown"}.`,
    `Previous session started at ${previous.startTime} and last emitted output at ${previous.lastEventAt}.`,
    "If prior terminal state is unavailable, continue from the latest task state and execution notes without redoing completed work.",
    "",
    prompt,
  ].join("\n");
}

function resolveTask(readModel: VaultReadModel, taskId: string) {
  const task = readModel.tasks.find((entry) => entry.id === taskId);
  if (task === undefined) {
    throw createError({ statusCode: 404, statusMessage: `Task ${taskId} was not found.` });
  }
  return task;
}

function resolveProject(readModel: VaultReadModel, projectId: string) {
  return readModel.projects.find((entry) => entry.id === projectId) ?? null
}

export function resolveLaunchCwd(vaultRoot: string, project: ReturnType<typeof resolveProject>): string {
  const configured = project?.codebases[0]?.path?.trim()
  if (!configured) return process.cwd()
  return configured.startsWith("/") ? configured : resolve(vaultRoot, configured)
}

function buildSessionObservationNote(runtimeKind: string, status: "running" | "stdout" | "stderr" | "closed" | "error", codeOrMessage?: number | string | null): string {
  if (status === "running") return `Background ${runtimeKind} session is running and waiting for agent output.`
  if (status === "stdout") return `${runtimeKind} session emitted terminal output.`
  if (status === "stderr") return `${runtimeKind} session emitted terminal error output.`
  if (status === "closed") return codeOrMessage === 0 ? `${runtimeKind} session exited cleanly.` : `${runtimeKind} session exited with code ${codeOrMessage ?? "unknown"}.`
  return `${runtimeKind} session failed: ${typeof codeOrMessage === "string" && codeOrMessage.trim().length > 0 ? codeOrMessage : "unknown error"}.`
}

function failureRecoveryPatch(runtimeKind: string, currentColumn: string | null, hasCronSchedule: boolean, codeOrMessage?: number | string | null) {
  const note = buildSessionObservationNote(runtimeKind, typeof codeOrMessage === "string" ? "error" : "closed", codeOrMessage)
  return {
    status: "failed" as const,
    column: hasCronSchedule ? "scheduled" : (currentColumn && currentColumn.trim().length > 0 ? currentColumn : "todo"),
    execution_notes: note,
    blocked_reason: note,
    blocked_since: null,
    completed_at: null,
    dispatch_status: "failed" as const,
    dispatch_reason: note,
    result: null,
  }
}

export interface TaskSessionObserverDeps {
  readonly heartbeatTaskLifecycle?: typeof heartbeatTaskLifecycle;
  readonly patchTaskLifecycle?: typeof patchTaskLifecycle;
  readonly appendAgentSessionEvent?: typeof appendAgentSessionEvent;
}

export interface TaskSessionObserver {
  readonly onLaunchStarted: () => Promise<void>;
  readonly onStdout: (chunk: string) => void;
  readonly onStderr: (chunk: string) => void;
  readonly onClose: (code: number | null) => void;
  readonly onError: (error: Error) => void;
  readonly dispose: () => void;
}

export function createTaskSessionObserver(options: {
  readonly sessionId: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly runtimeKind: string;
  readonly vaultRoot: string;
  readonly currentColumn?: string | null;
  readonly hasCronSchedule?: boolean;
  readonly heartbeatIntervalMs?: number;
}, deps: TaskSessionObserverDeps = {}): TaskSessionObserver {
  const runHeartbeatTaskLifecycle = deps.heartbeatTaskLifecycle ?? heartbeatTaskLifecycle
  const runPatchTaskLifecycle = deps.patchTaskLifecycle ?? patchTaskLifecycle
  const appendEvent = deps.appendAgentSessionEvent ?? appendAgentSessionEvent

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let sawStdout = false
  let sawStderr = false

  const safePatchNote = async (text: string) => {
    await runPatchTaskLifecycle({
      taskId: options.taskId,
      actorId: options.agentId,
      patch: { execution_notes: text },
      vaultRoot: options.vaultRoot,
    })
  }

  const safeAppendSummary = async (text: string) => {
    await appendEvent(options.vaultRoot, {
      sessionId: options.sessionId,
      agentId: options.agentId,
      taskId: options.taskId,
      type: "reasoning.summary",
      timestamp: new Date().toISOString(),
      text,
    })
  }

  const safeHeartbeat = async () => {
    await runHeartbeatTaskLifecycle({
      taskId: options.taskId,
      actorId: options.agentId,
      vaultRoot: options.vaultRoot,
    })
  }

  const note = (status: Parameters<typeof buildSessionObservationNote>[1], codeOrMessage?: number | string | null) => buildSessionObservationNote(options.runtimeKind, status, codeOrMessage)

  const startHeartbeat = () => {
    const intervalMs = options.heartbeatIntervalMs ?? DEFAULT_SESSION_HEARTBEAT_MS
    if (intervalMs <= 0 || heartbeatTimer !== null) return
    heartbeatTimer = setInterval(() => {
      void safeHeartbeat().catch(() => {})
    }, intervalMs)
  }

  const dispose = () => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  return {
    onLaunchStarted: async () => {
      startHeartbeat()
      const text = note("running")
      await safePatchNote(text)
      await safeAppendSummary(text)
    },
    onStdout: () => {
      if (sawStdout) return
      sawStdout = true
      const text = note("stdout")
      void safePatchNote(text).catch(() => {})
      void safeAppendSummary(text).catch(() => {})
    },
    onStderr: () => {
      if (sawStderr) return
      sawStderr = true
      const text = note("stderr")
      void safePatchNote(text).catch(() => {})
      void safeAppendSummary(text).catch(() => {})
    },
    onClose: (code) => {
      dispose()
      const text = note("closed", code)
      if (code === 0) {
        void safePatchNote(text).catch(() => {})
      } else {
        void runPatchTaskLifecycle({
          taskId: options.taskId,
          actorId: options.agentId,
          patch: failureRecoveryPatch(options.runtimeKind, options.currentColumn ?? null, options.hasCronSchedule === true, code),
          vaultRoot: options.vaultRoot,
          releaseLock: true,
        }).catch(() => {})
      }
      void safeAppendSummary(text).catch(() => {})
    },
    onError: (error) => {
      dispose()
      const text = note("error", error.message)
      void runPatchTaskLifecycle({
        taskId: options.taskId,
        actorId: options.agentId,
        patch: failureRecoveryPatch(options.runtimeKind, options.currentColumn ?? null, options.hasCronSchedule === true, error.message),
        vaultRoot: options.vaultRoot,
        releaseLock: true,
      }).catch(() => {})
      void safeAppendSummary(text).catch(() => {})
    },
    dispose,
  }
}

function makeLineStreamParser(onEvent: (type: string, text: string) => void): (chunk: string) => void {
  let buf = '';
  return (chunk: string) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const ev = JSON.parse(trimmed);
        const type: string = ev.type ?? 'unknown';
        if (type === 'assistant') {
          const blocks: unknown[] = ev.message?.content ?? [];
          for (const block of blocks) {
            if (typeof block !== 'object' || block === null) continue;
            const b = block as Record<string, unknown>;
            if (b.type === 'text' && typeof b.text === 'string') {
              onEvent('reasoning', b.text);
            } else if (b.type === 'tool_use' && typeof b.name === 'string') {
              const input = JSON.stringify(b.input ?? {}).slice(0, 120);
              onEvent('tool_use', `${b.name}(${input})`);
            }
          }
        } else if (type === 'result') {
          const subtype = typeof ev.subtype === 'string' ? ev.subtype : 'unknown';
          const result = typeof ev.result === 'string' ? ev.result.slice(0, 200) : '';
          onEvent('result', result ? `${subtype}: ${result}` : subtype);
        } else if (type === 'text' && typeof ev.part?.text === 'string') {
          onEvent('reasoning', ev.part.text);
        } else if (type === 'tool_use') {
          const tool = typeof ev.part?.tool === 'string' ? ev.part.tool : 'tool';
          const title = typeof ev.part?.title === 'string' ? ev.part.title : '';
          onEvent('tool_use', title ? `${tool}: ${title}` : tool);
        } else if (type === 'step_start' || type === 'step_finish') {
          const reason = typeof ev.part?.reason === 'string' ? ` (${ev.part.reason})` : '';
          onEvent('raw', `${type}${reason}`);
        }
      } catch {
        // non-JSON line from opencode default format — log as-is
        if (trimmed.length > 0) onEvent('raw', trimmed.slice(0, 200));
      }
    }
  };
}

function resolveAgent(readModel: VaultReadModel, agentId: string) {
  const agent = readModel.agents.find((entry) => entry.id === agentId || entry.aliases.includes(agentId));
  if (agent === undefined) {
    throw createError({ statusCode: 404, statusMessage: `Agent ${agentId} was not found.` });
  }
  return agent;
}

function splitCommandTemplate(template: string, prompt: string): { command: string; args: string[] } {
  const placeholder = "__RELAYHQ_PROMPT__"
  const parts = template
    .replace(/\{prompt\}/g, placeholder)
    .trim()
    .match(/(?:[^"]\S*|".+?")+/g)

  if (!parts || parts.length === 0) {
    throw createError({ statusCode: 422, statusMessage: "command template is empty." })
  }

  const [command, ...args] = parts.map((part) => {
    const normalized = part.replace(/^"|"$/g, "")
    return normalized === placeholder ? prompt : normalized
  })
  return { command, args }
}

export function resolveCommand(agent: ReturnType<typeof resolveAgent>, prompt: string, cwd?: string): { command: string; args: string[]; runtimeKind: string } {
  const runtimeKind = agent.runtimeKind ?? agent.provider;
  if (runtimeKind === "opencode" || agent.provider === "opencode") {
    return {
      command: "opencode",
      args: [
        "run",
        prompt,
        "--format",
        "json",
        "--dangerously-skip-permissions",
        ...(cwd ? ["--dir", cwd] : []),
      ],
      runtimeKind: "opencode",
    };
  }
  if (runtimeKind === "claude-code" || agent.provider === "claude") {
    return {
      command: "claude",
      args: ["-p", prompt, "--output-format", "stream-json", "--verbose",
             "--allowedTools", "Bash,Write,Read,Edit,Glob,Grep"],
      runtimeKind: "claude-code",
    };
  }
  if (runtimeKind === "codex") {
    return { command: "codex", args: [prompt], runtimeKind: "codex" };
  }
  if (agent.commandTemplate && agent.commandTemplate.trim().length > 0) {
    const resolved = splitCommandTemplate(agent.commandTemplate, prompt)
    return { ...resolved, runtimeKind }
  }
  if (agent.runCommand && agent.runCommand.trim().length > 0) {
    const [command, ...args] = agent.runCommand.trim().split(/\s+/);
    return { command, args, runtimeKind };
  }

  throw createError({ statusCode: 422, statusMessage: `No launch command is configured for agent ${agent.id}.` });
}

export async function launchAgentSession(request: LaunchAgentSessionRequest): Promise<LaunchAgentSessionResult> {
  const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const agent = resolveAgent(readModel, request.agentId);
  const task = resolveTask(readModel, request.taskId);
  const project = resolveProject(readModel, task.projectId);

  if (task.assignee !== agent.id && !agent.aliases.includes(task.assignee)) {
    throw createError({ statusCode: 409, statusMessage: `Task ${task.id} is not assigned to agent ${agent.id}.` });
  }

  const launchMode = request.mode ?? 'fresh';
  const launchSurface = request.surface ?? 'background';
  const previousSession = request.previousSessionId ? agentRunnerManager.getRunner(request.previousSessionId) : (agentRunnerManager.getAgentRunners(agent.id)[0] ? agentRunnerManager.getRunner(agentRunnerManager.getAgentRunners(agent.id)[0].sessionId) : null);
  let prompt = await buildBootstrapPrompt(task.id, vaultRoot, agent.id);
  if (launchMode === 'resume') {
    prompt = appendResumeInstructions(prompt, previousSession);
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RELAYHQ_AGENT_ID: agent.id,
    RELAYHQ_TASK_ID: task.id,
    RELAYHQ_BASE_URL: process.env.RELAYHQ_BASE_URL ?? 'http://127.0.0.1:44210',
  };

  const sessionId = createSessionId()
  const cwd = resolveLaunchCwd(vaultRoot, project)
  const { command, args, runtimeKind } = resolveCommand(agent, prompt, cwd);
  ensureCommandAvailable(command);
  if (launchSurface === 'visible-terminal') {
    ensureVisibleTerminalAvailable()
  }

  await claimTaskLifecycle({ taskId: task.id, actorId: agent.id, assignee: agent.id, vaultRoot });
  const observer = launchSurface === 'background'
    ? createTaskSessionObserver({
        sessionId,
        taskId: task.id,
        agentId: agent.id,
        runtimeKind,
        vaultRoot,
        currentColumn: task.columnId,
        hasCronSchedule: task.cronSchedule != null,
      })
    : null

  const runner = launchSurface === 'visible-terminal'
    ? (() => {
        const envExports = Object.entries(env)
          .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
          .join('; ')
        const commandLine = [command, ...args.map(shellQuote)].join(' ')
        const script = `cd ${shellQuote(cwd)}; ${envExports}; ${commandLine}; status=$?; printf '\n[relayhq] Session ended with code %s. Press Enter to close.\n' "$status"; read _`
        return agentRunnerManager.startRunner({
          sessionId,
          agentName: agent.id,
          taskId: task.id,
          provider: agent.provider,
          runtimeKind,
          launchSurface,
          launchMode,
          resumedFromSessionId: launchMode === 'resume' ? previousSession?.sessionId ?? null : null,
          command: 'x-terminal-emulator',
          args: ['-e', 'bash', '-lc', script],
          prompt,
          cwd,
        })
      })()
    : (() => {
        const backgroundCommand = runtimeKind === 'opencode'
          ? wrapCommandForPty(command, args)
          : { command, args: [...args] }

        return agentRunnerManager.startRunner({
        sessionId,
        agentName: agent.id,
        taskId: task.id,
        provider: agent.provider,
        runtimeKind,
        launchSurface,
        launchMode,
        resumedFromSessionId: launchMode === 'resume' ? previousSession?.sessionId ?? null : null,
        command: backgroundCommand.command,
        args: backgroundCommand.args,
        prompt,
        cwd,
        env,
        onStdout: (() => {
          const parse = makeLineStreamParser((evType, text) => {
            const sessionEventType = evType === 'reasoning' ? 'reasoning.summary' : 'terminal.stdout';
            void appendAgentSessionEvent(vaultRoot, {
              sessionId,
              agentId: agent.id,
              taskId: task.id,
              type: sessionEventType,
              timestamp: new Date().toISOString(),
              text: `[${evType}] ${text}`,
            }).catch(() => {});
          });
          return (chunk: string) => {
            observer?.onStdout(chunk);
            parse(chunk);
          };
        })(),
        onStderr: (chunk) => {
          observer?.onStderr(chunk)
          void appendAgentSessionEvent(vaultRoot, {
            sessionId,
            agentId: agent.id,
            taskId: task.id,
            type: 'terminal.stderr',
            timestamp: new Date().toISOString(),
            text: chunk,
          })
        },
        onClose: (code) => {
          observer?.onClose(code)
          void appendAgentSessionEvent(vaultRoot, {
            sessionId,
            agentId: agent.id,
            taskId: task.id,
            type: code === 0 ? 'session.ended' : 'session.failed',
            timestamp: new Date().toISOString(),
            code,
          })
        },
        onError: (error) => {
          observer?.onError(error)
          void appendAgentSessionEvent(vaultRoot, {
            sessionId,
            agentId: agent.id,
            taskId: task.id,
            type: 'session.failed',
            timestamp: new Date().toISOString(),
            text: error.message,
          })
        },
      })
      })()

  await appendAgentSessionEvent(vaultRoot, {
    sessionId,
    agentId: agent.id,
    taskId: task.id,
    type: 'session.started',
    timestamp: new Date().toISOString(),
    text: `Launch ${launchMode} via ${runtimeKind}: ${runner.command} ${runner.args.join(' ')}`,
  })
  await observer?.onLaunchStarted()

  return {
    agentId: agent.id,
    taskId: task.id,
    sessionId: runner.sessionId,
    runnerId: runner.id,
    runtimeKind,
    launchSurface,
    launchMode,
    command: runner.command,
    args: runner.args,
  };
}
