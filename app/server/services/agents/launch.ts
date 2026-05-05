import { execSync } from "node:child_process";
import { resolve } from "node:path";

import { createError } from "h3";

import type { ReadModelAgent, ReadModelCoordinatorThread, ReadModelProject, ReadModelTask, VaultReadModel } from "../../models/read-model";
import { findAgentForProject } from "../../models/read-model";
import { readCanonicalVaultReadModel } from "../vault/read";
import { resolveVaultWorkspaceRoot } from "../vault/runtime";
import { writeAuditNote } from "../vault/audit-write";
import { claimTaskLifecycle, heartbeatTaskLifecycle, patchTaskLifecycle } from "../vault/task-lifecycle";
import { appendAgentSessionEvent, listRecordedAgentSessions, readAgentSessionEvents, readAgentSessionUsage, readRecordedAgentSession, type AgentSessionUsageRecord, type RecordedAgentSessionSummary } from "./session-events";
import { clearAgentTaskSessionRecord, markAgentTaskSessionStopped, readAgentTaskSessionRecord, upsertAgentTaskSessionRecord } from "./session-registry";
import { agentRunnerManager, isRunnerSessionReusable, type AgentRunner } from "../runners/manager";
import { readTaskBootstrapPack, type BootstrapPack } from "../../api/agent/bootstrap/[taskId].get";
import { assertWorkPolicy, isCoordinatorAgent, isCoordinatorTask } from "../policy/work-policy";
import { createRuntimeCapacityError, findRuntimeCapacityBlocker, runWithRuntimeCapacityGuard } from "./capacity";

const DEFAULT_SESSION_HEARTBEAT_MS = 30_000

export interface LaunchAgentSessionRequest {
  readonly agentId: string;
  readonly taskId: string;
  readonly coordinatorThreadId?: string | null;
  readonly mode?: 'fresh' | 'resume';
  readonly surface?: 'background' | 'visible-terminal';
  readonly previousSessionId?: string | null;
  readonly userMessage?: string | null;
  readonly vaultRoot?: string;
}

export interface LaunchAgentSessionResult {
  readonly agentId: string;
  readonly taskId: string;
  readonly coordinatorThreadId?: string | null;
  readonly sessionId: string;
  readonly runnerId: string;
  readonly runtimeKind: string;
  readonly launchSurface: 'background' | 'visible-terminal';
  readonly launchMode: 'fresh' | 'resume';
  readonly command: string;
  readonly args: ReadonlyArray<string>;
}

function toExistingSessionResult(runner: AgentRunner): LaunchAgentSessionResult {
  return {
    agentId: runner.agentName,
    taskId: runner.taskId ?? "",
    sessionId: runner.sessionId,
    runnerId: runner.id,
    runtimeKind: runner.runtimeKind,
    launchSurface: runner.launchSurface,
    launchMode: runner.launchMode,
    command: runner.command,
    args: runner.args,
  }
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

async function buildBootstrapPrompt(taskId: string, vaultRoot: string, agentId: string, options: { inlineContextFiles?: boolean } = {}): Promise<string> {
  const pack = await readTaskBootstrapPack(taskId, {
    resolveRoot: () => vaultRoot,
    includeProtocol: true,
    inlineContextFiles: options.inlineContextFiles ?? true,
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

function appendRecordedResumeInstructions(prompt: string, previous: RecordedAgentSessionSummary | null): string {
  if (previous === null) return prompt;
  return [
    `Resume the previous RelayHQ session ${previous.sessionId} for task ${previous.taskId ?? "unknown"}.`,
    `Previous session started at ${previous.startTime} and last emitted output at ${previous.lastEventAt}.`,
    "If prior terminal state is unavailable, continue from the latest task state and execution notes without redoing completed work.",
    "",
    prompt,
  ].join("\n");
}

function buildCoordinatorPolicyPrompt(project: ReadModelProject | null): string {
  return [
    "Coordinator policy:",
    `- You are the primary coordinator${project ? ` for project ${project.name}` : ""}.`,
    "- Do not implement code changes, run project work as a worker, or silently complete implementation tasks yourself.",
    "- Convert requests into worker tasks, subtasks, approvals, and concise status updates.",
    "- Prefer warm resume, summary reload, and selective context retrieval before pulling large context again.",
    "- If implementation is needed, create or update worker tasks and keep the user in the coordinator conversation unless they explicitly switch to a worker transcript.",
  ].join("\n")
}

function resolveInteractiveCoordinatorCommand(agent: ReadModelAgent, prompt: string, cwd?: string): { command: string; args: string[]; runtimeKind: string } {
  return resolveCommand(agent, prompt, cwd)
}

function buildCoordinatorThreadBootstrapPrompt(options: {
  readonly agent: ReadModelAgent;
  readonly project: ReadModelProject;
  readonly thread: ReadModelCoordinatorThread;
  readonly vaultRoot: string;
}): string {
  const base = process.env.RELAYHQ_BASE_URL ?? 'http://127.0.0.1:44210'
  return [
    `PROJECT COORDINATOR THREAD: ${options.project.name}`,
    `THREAD ID: ${options.thread.id}`,
    `PROJECT ID: ${options.project.id}`,
    `WORKSPACE ID: ${options.project.workspaceId}`,
    `COORDINATOR AGENT ID: ${options.agent.id}`,
    "",
    "## Objective",
    "Act as the project coordinator chat entrypoint for this project. Break requests into worker tasks, orchestrate handoffs, and summarize progress without implementing code changes directly.",
    "",
    "## Context",
    options.project.description ? `Project description: ${options.project.description}` : "Project description: none recorded.",
    options.project.codebases.length > 0 ? `Codebases: ${options.project.codebases.map((entry) => `${entry.name}=${entry.path}`).join(", ")}` : "Codebases: none recorded.",
    "",
    "## Protocol",
    `RELAYHQ_BASE_URL: ${base}`,
    `VAULT_ROOT: ${options.vaultRoot}`,
    `AGENT_ID: ${options.agent.id}`,
    "",
    `Use actorId exactly as ${options.agent.id} for all RelayHQ API calls.`,
    "Create or update worker tasks through RelayHQ APIs when implementation is needed; do not use this coordinator thread as a worker task.",
    "",
    buildCoordinatorPolicyPrompt(options.project),
  ].join("\n")
}

function summarizeCoordinatorResumeEvents(events: Awaited<ReturnType<typeof readAgentSessionEvents>>): string[] {
  return events
    .filter((event) => event.type === "user.message" || event.type === "reasoning.summary" || event.type === "session.failed" || event.type === "session.ended")
    .slice(-8)
    .map((event) => {
      const label = event.type === "user.message"
        ? "User"
        : event.type === "reasoning.summary"
          ? "Coordinator"
          : event.type === "session.failed"
            ? "Failure"
            : "Session"
      const detail = event.text?.trim() || (event.code != null ? `Exit code ${event.code}` : "No details")
      return `- ${label}: ${detail}`
    })
}

async function buildLaunchPrompt(options: {
  agent: ReadModelAgent;
  task: ReadModelTask | null;
  project: ReadModelProject | null;
  coordinatorThread?: ReadModelCoordinatorThread | null;
  vaultRoot: string;
  launchMode: 'fresh' | 'resume';
  previousSession: AgentRunner | null;
  recordedPreviousSession: RecordedAgentSessionSummary | null;
  userMessage?: string | null;
}): Promise<string> {
  const coordinator = isCoordinatorAgent(options.agent)
  if (coordinator && options.coordinatorThread && options.project) {
    let prompt = buildCoordinatorThreadBootstrapPrompt({
      agent: options.agent,
      project: options.project,
      thread: options.coordinatorThread,
      vaultRoot: options.vaultRoot,
    })

    const latestUserMessage = options.userMessage?.trim() ?? ""
    const messageSection = latestUserMessage.length > 0
      ? `\n\n## New User Message\n${latestUserMessage}\n\nRespond to this new user message first, then continue coordinating from the latest project state.`
      : ""

    if (options.launchMode !== 'resume') {
      return `${prompt}${messageSection}`
    }

    const previousSessionId = options.previousSession?.sessionId ?? options.recordedPreviousSession?.sessionId ?? null
    const summaryLines = previousSessionId
      ? summarizeCoordinatorResumeEvents(await readAgentSessionEvents(options.vaultRoot, previousSessionId))
      : []
    const usage = previousSessionId
      ? await readAgentSessionUsage(options.vaultRoot, previousSessionId)
      : null

    return [
      "Resume the coordinator conversation using the compact state below instead of replaying the full transcript.",
      previousSessionId ? `Previous session: ${previousSessionId}` : "Previous session: none recorded",
      `Coordinator thread: ${options.coordinatorThread.id}`,
      usage && (usage.totalTokens !== null || usage.estimatedRemainingContextTokens !== null)
        ? `Previous usage: ${usage.totalTokens != null ? `${usage.totalTokens.toLocaleString()} total tokens` : "tokens unknown"}${usage.estimatedRemainingContextTokens != null ? `, est. ${usage.estimatedRemainingContextTokens.toLocaleString()} context tokens remaining` : ""}.`
        : "Previous usage: unknown.",
      summaryLines.length > 0 ? "Recent transcript summary:\n" + summaryLines.join("\n") : "Recent transcript summary: none captured.",
      "Retrieve more code or docs only if needed for the next orchestration step.",
      "",
      `${prompt}${messageSection}`,
    ].join("\n")
  }

  if (!options.task) {
    throw createError({ statusCode: 422, statusMessage: "Task context is required for worker launches." })
  }

  let prompt = await buildBootstrapPrompt(options.task.id, options.vaultRoot, options.agent.id, {
    inlineContextFiles: coordinator ? options.launchMode !== 'resume' : true,
  })

  if (coordinator) {
    prompt = `${prompt}\n\n## Coordinator Policy\n${buildCoordinatorPolicyPrompt(options.project)}`
  }

  if (options.launchMode !== 'resume') {
    return prompt
  }

  if (!coordinator) {
    return options.previousSession
      ? appendResumeInstructions(prompt, options.previousSession)
      : appendRecordedResumeInstructions(prompt, options.recordedPreviousSession)
  }

  const previousSessionId = options.previousSession?.sessionId ?? options.recordedPreviousSession?.sessionId ?? null
  const summaryLines = previousSessionId
    ? summarizeCoordinatorResumeEvents(await readAgentSessionEvents(options.vaultRoot, previousSessionId))
    : []
  const usage = previousSessionId
    ? await readAgentSessionUsage(options.vaultRoot, previousSessionId)
    : null

  return [
    "Resume the coordinator conversation using the compact state below instead of replaying the full transcript.",
    previousSessionId ? `Previous session: ${previousSessionId}` : "Previous session: none recorded",
    options.task.executionNotes ? `Latest task notes: ${options.task.executionNotes}` : "Latest task notes: none recorded",
    usage && (usage.totalTokens !== null || usage.estimatedRemainingContextTokens !== null)
      ? `Previous usage: ${usage.totalTokens != null ? `${usage.totalTokens.toLocaleString()} total tokens` : "tokens unknown"}${usage.estimatedRemainingContextTokens != null ? `, est. ${usage.estimatedRemainingContextTokens.toLocaleString()} context tokens remaining` : ""}.`
      : "Previous usage: unknown.",
    summaryLines.length > 0 ? "Recent transcript summary:\n" + summaryLines.join("\n") : "Recent transcript summary: none captured.",
    "Retrieve more code or docs only if needed for the next orchestration step.",
    "",
    prompt,
  ].join("\n")
}

function resolveCoordinatorThread(readModel: VaultReadModel, threadId: string) {
  const thread = (readModel.coordinatorThreads ?? []).find((entry) => entry.id === threadId);
  if (thread === undefined) {
    throw createError({ statusCode: 404, statusMessage: `Coordinator thread ${threadId} was not found.` });
  }
  return thread;
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

function estimateTokensFromText(value: string): number {
  const normalized = value.trim()
  if (normalized.length === 0) return 0
  return Math.max(1, Math.ceil(normalized.length / 4))
}

function resolveContextWindowTokens(model: string | null, runtimeKind: string): number | null {
  const normalizedModel = model?.toLowerCase() ?? ''
  const normalizedRuntime = runtimeKind.toLowerCase()

  if (normalizedModel.includes('claude') || normalizedRuntime.includes('claude')) return 200_000
  if (normalizedModel.includes('gpt') || normalizedRuntime.includes('opencode') || normalizedRuntime.includes('codex')) return 128_000
  return null
}

function buildEstimatedSessionUsage(prompt: string, model: string | null, runtimeKind: string): AgentSessionUsageRecord {
  const promptTokens = estimateTokensFromText(prompt)
  const contextWindowTokens = resolveContextWindowTokens(model, runtimeKind)
  return {
    promptTokens,
    totalTokens: promptTokens,
    model,
    usageSource: 'estimated',
    estimatedRemainingContextTokens: contextWindowTokens === null ? null : Math.max(0, contextWindowTokens - promptTokens),
    contextWindowTokens,
  }
}

function readUsageNumber(record: Record<string, unknown>, keys: ReadonlyArray<string>): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }
  return null
}

function extractRuntimeUsage(payload: unknown): AgentSessionUsageRecord | null {
  if (typeof payload !== 'object' || payload === null) return null

  const record = payload as Record<string, unknown>
  const usageCandidate = typeof record.usage === 'object' && record.usage !== null
    ? record.usage as Record<string, unknown>
    : typeof record.message === 'object' && record.message !== null && typeof (record.message as Record<string, unknown>).usage === 'object' && (record.message as Record<string, unknown>).usage !== null
      ? (record.message as Record<string, unknown>).usage as Record<string, unknown>
      : typeof record.result === 'object' && record.result !== null && typeof (record.result as Record<string, unknown>).usage === 'object' && (record.result as Record<string, unknown>).usage !== null
        ? (record.result as Record<string, unknown>).usage as Record<string, unknown>
        : null

  if (usageCandidate === null) return null

  const promptTokens = readUsageNumber(usageCandidate, ['prompt_tokens', 'input_tokens'])
  const completionTokens = readUsageNumber(usageCandidate, ['completion_tokens', 'output_tokens'])
  const totalTokens = readUsageNumber(usageCandidate, ['total_tokens'])
  const costUsd = readUsageNumber(usageCandidate, ['cost_usd', 'total_cost'])
  const model = typeof record.model === 'string'
    ? record.model
    : typeof usageCandidate.model === 'string'
      ? usageCandidate.model
      : null

  if (promptTokens === null && completionTokens === null && totalTokens === null && costUsd === null && model === null) {
    return null
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
    model,
    usageSource: 'runtime',
  }
}

function failureRecoveryPatch(runtimeKind: string, currentColumn: string | null, hasCronSchedule: boolean, codeOrMessage?: number | string | null) {
  const note = buildSessionObservationNote(runtimeKind, typeof codeOrMessage === "string" ? "error" : "closed", codeOrMessage)
  return {
    status: "failed" as const,
    column: hasCronSchedule ? "scheduled" : "todo",
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
  readonly prompt?: string;
  readonly model?: string | null;
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
  let sawFatalError = false

  // Opencode (and other runtimes) exit with code 0 even when a fatal startup error occurs.
  // Detect known fatal patterns so we can trigger failure recovery despite the clean exit code.
  const FATAL_OUTPUT_PATTERNS = [
    /ProviderModelNotFoundError/,
    /ProviderAuthError/,
    /UnauthorizedError/,
    /ConfigError/,
  ]

  const safePersistSessionUsage = async () => {
    const summary = await readAgentSessionUsage(options.vaultRoot, options.sessionId)
    if (summary.totalTokens === null && summary.costUsd === null && summary.model === null) {
      return
    }

    const readModel = await readCanonicalVaultReadModel(options.vaultRoot)
    const currentTask = readModel.tasks.find((entry) => entry.id === options.taskId)
    const patch: Record<string, unknown> = {}

    if (summary.totalTokens !== null) {
      patch.tokens_used = (currentTask?.tokensUsed ?? 0) + summary.totalTokens
    }
    if (summary.costUsd !== null) {
      patch.cost_usd = Number(((currentTask?.costUsd ?? 0) + summary.costUsd).toFixed(6))
    }
    if (summary.model !== null) {
      patch.model = summary.model
    }

    if (Object.keys(patch).length > 0) {
      await runPatchTaskLifecycle({
        taskId: options.taskId,
        actorId: options.agentId,
        patch,
        vaultRoot: options.vaultRoot,
      })
    }

    await writeAuditNote({
      vaultRoot: options.vaultRoot,
      taskId: options.taskId,
      source: options.agentId,
      message: `session usage captured for ${options.sessionId}`,
      tokensUsed: summary.totalTokens,
      promptTokens: summary.promptTokens,
      completionTokens: summary.completionTokens,
      costUsd: summary.costUsd,
      model: summary.model,
      usageSource: summary.usageSource,
    })
  }

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
      if (options.prompt && options.prompt.trim().length > 0) {
        await appendEvent(options.vaultRoot, {
          sessionId: options.sessionId,
          agentId: options.agentId,
          taskId: options.taskId,
          type: 'session.usage',
          timestamp: new Date().toISOString(),
          usage: buildEstimatedSessionUsage(options.prompt, options.model ?? null, options.runtimeKind),
        })
      }
    },
    onStdout: (chunk) => {
      if (!sawFatalError && FATAL_OUTPUT_PATTERNS.some((p) => p.test(chunk))) {
        sawFatalError = true
      }
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
      const effectiveCode = (code === 0 && sawFatalError) ? 1 : code
      const text = note("closed", code)
      if (effectiveCode === 0) {
        void safePatchNote(text).catch(() => {})
      } else {
        void runPatchTaskLifecycle({
          taskId: options.taskId,
          actorId: options.agentId,
          patch: failureRecoveryPatch(options.runtimeKind, options.currentColumn ?? null, options.hasCronSchedule === true, effectiveCode),
          vaultRoot: options.vaultRoot,
          releaseLock: true,
        }).catch(() => {})
      }
      void safeAppendSummary(text).catch(() => {})
      void safePersistSessionUsage().catch(() => {})
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
      void safePersistSessionUsage().catch(() => {})
    },
    dispose,
  }
}

function makeLineStreamParser(onEvent: (type: string, text: string) => void, onUsage?: (usage: AgentSessionUsageRecord) => void): (chunk: string) => void {
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
        const usage = extractRuntimeUsage(ev)
        if (usage !== null) {
          onUsage?.(usage)
        }
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
        } else if (type === 'thinking' && typeof ev.part?.thinking === 'string') {
          onEvent('thinking', ev.part.thinking);
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

const PROVIDER_ENV_VAR: Readonly<Record<string, string>> = {
  anthropic:   'ANTHROPIC_API_KEY',
  openai:      'OPENAI_API_KEY',
  google:      'GOOGLE_API_KEY',
  openrouter:  'OPENROUTER_API_KEY',
}

function resolveApiKeyFromRef(ref: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!ref) return null
  if (ref.startsWith('env:')) {
    const varName = ref.slice(4)
    return env[varName]?.trim() || null
  }
  // secret: and vault: refs not implemented — skip silently
  return null
}

function buildProviderEnvOverride(provider: string, apiKeyRef: string | null | undefined): NodeJS.ProcessEnv {
  const key = resolveApiKeyFromRef(apiKeyRef)
  if (!key) return {}
  const envVar = PROVIDER_ENV_VAR[provider]
  if (!envVar) return {}
  return { [envVar]: key }
}

function resolveAgent(readModel: VaultReadModel, agentId: string, projectId?: string | null) {
  const agent = findAgentForProject(readModel.agents, agentId, projectId ?? null);
  if (agent === null) {
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
    const model = agent.model?.trim().length > 0 ? `${agent.provider}/${agent.model.trim()}` : null
    return {
      command: "opencode",
      args: [
        "run",
        prompt,
        ...(model ? ["--model", model] : []),
        "--title",
        `RelayHQ ${agent.id}`,
        "--format",
        "json",
        "--thinking",
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
  return await runWithRuntimeCapacityGuard(async () => {
    const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();
    const readModel = await readCanonicalVaultReadModel(vaultRoot);
    const coordinatorThread = request.coordinatorThreadId ? resolveCoordinatorThread(readModel, request.coordinatorThreadId) : null;
    const task = coordinatorThread ? null : resolveTask(readModel, request.taskId);
    const project = coordinatorThread ? resolveProject(readModel, coordinatorThread.projectId) : (task ? resolveProject(readModel, task.projectId) : null);
    const projectIdForAgent = coordinatorThread?.projectId ?? task?.projectId ?? null;
    const agent = resolveAgent(readModel, request.agentId, projectIdForAgent);
    const coordinatorChatSession = isCoordinatorAgent(agent) && (coordinatorThread !== null || (task !== null && isCoordinatorTask(task)))

    if (coordinatorThread !== null) {
      assertWorkPolicy({ actorId: agent.id, actorIntent: "agent", action: "coordinate", readModel, task })
    } else if (task) {
      assertWorkPolicy({ actorId: agent.id, actorIntent: "agent", action: "execute", readModel, task })
    }
    if (coordinatorThread && coordinatorThread.coordinatorAgentId !== agent.id && !agent.aliases.includes(coordinatorThread.coordinatorAgentId)) {
      throw createError({ statusCode: 409, statusMessage: `Coordinator thread ${coordinatorThread.id} is assigned to ${coordinatorThread.coordinatorAgentId}.` })
    }

    const registrySession = coordinatorThread === null && task !== null
      ? await readAgentTaskSessionRecord(vaultRoot, agent.id, task.id)
      : null
    const existingTaskRunner = coordinatorThread === null && task !== null
      ? agentRunnerManager.getReusableTaskRunner(agent.id, task.id)
        ?? (registrySession?.status === "active" && registrySession.sessionId
          ? agentRunnerManager.getRunner(registrySession.sessionId)
          : null)
      : null
    if (existingTaskRunner && isRunnerSessionReusable(existingTaskRunner) && task) {
      await upsertAgentTaskSessionRecord(vaultRoot, {
        agentId: agent.id,
        taskId: task.id,
        sessionId: existingTaskRunner.sessionId,
        status: "active",
        updatedAt: new Date().toISOString(),
        ...(task.projectId ? { projectId: task.projectId } : {}),
      })
      return toExistingSessionResult(existingTaskRunner)
    }
    if (registrySession?.status === "active" && registrySession.sessionId && task) {
      await clearAgentTaskSessionRecord(vaultRoot, agent.id, task.id, registrySession.sessionId)
    }

    const capacityBlocker = task ? findRuntimeCapacityBlocker({
      readModel,
      taskId: task.id,
    }) : null;
    if (capacityBlocker) {
      throw createRuntimeCapacityError({ taskId: task?.id ?? request.taskId, blocker: capacityBlocker });
    }

    const launchMode = request.mode ?? 'fresh';
    const launchSurface = request.surface ?? 'background';
    const previousSession = request.previousSessionId
      ? agentRunnerManager.getRunner(request.previousSessionId)
      : (task ? agentRunnerManager.getReusableTaskRunner(agent.id, task.id) : null)
        ?? (agentRunnerManager.getAgentRunners(agent.id)[0] ? agentRunnerManager.getRunner(agentRunnerManager.getAgentRunners(agent.id)[0].sessionId) : null);
    const recordedPreviousSession = request.previousSessionId
      ? await readRecordedAgentSession(vaultRoot, request.previousSessionId)
      : previousSession === null
        ? (await listRecordedAgentSessions(vaultRoot, agent.id))[0] ?? null
        : null
    const resumeFromSessionId = previousSession?.sessionId ?? recordedPreviousSession?.sessionId ?? null
    const prompt = await buildLaunchPrompt({ agent, task, project, coordinatorThread, vaultRoot, launchMode, previousSession, recordedPreviousSession, userMessage: request.userMessage ?? null })

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...buildProviderEnvOverride(agent.provider, agent.apiKeyRef),
      RELAYHQ_AGENT_ID: agent.id,
      ...(task ? { RELAYHQ_TASK_ID: task.id } : {}),
      ...(coordinatorThread ? { RELAYHQ_COORDINATOR_THREAD_ID: coordinatorThread.id, RELAYHQ_PROJECT_ID: coordinatorThread.projectId } : {}),
      RELAYHQ_BASE_URL: process.env.RELAYHQ_BASE_URL ?? 'http://127.0.0.1:44210',
    };

    const sessionId = createSessionId()
    const sessionTaskId = task?.id ?? coordinatorThread?.id ?? request.taskId
    const cwd = resolveLaunchCwd(vaultRoot, project)
    const { command, args, runtimeKind } = coordinatorChatSession
      ? resolveInteractiveCoordinatorCommand(agent, prompt, cwd)
      : resolveCommand(agent, prompt, cwd)
    ensureCommandAvailable(command);
    if (launchSurface === 'visible-terminal') {
      ensureVisibleTerminalAvailable()
    }

    // Claim the task BEFORE spawning so that if the process exits instantly the
    // onClose failureRecoveryPatch resets from "in-progress" → recovery state,
    // rather than racing against a "todo" task and leaving it stuck as "failed".
    if (!coordinatorChatSession && task) {
      await claimTaskLifecycle({ taskId: task.id, actorId: agent.id, assignee: agent.id, vaultRoot, skipCapacityGuard: true });
    }

    const observer = launchSurface === 'background' && !coordinatorChatSession && task !== null
        ? createTaskSessionObserver({
          sessionId,
          taskId: task.id,
          agentId: agent.id,
          runtimeKind,
          vaultRoot,
          prompt,
          model: agent.model,
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
            taskId: sessionTaskId,
            provider: agent.provider,
            runtimeKind,
            launchSurface,
            launchMode,
            resumedFromSessionId: launchMode === 'resume' ? resumeFromSessionId : null,
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
            taskId: sessionTaskId,
            provider: agent.provider,
            runtimeKind,
            launchSurface,
            launchMode,
            resumedFromSessionId: launchMode === 'resume' ? resumeFromSessionId : null,
            command: backgroundCommand.command,
            args: backgroundCommand.args,
            prompt,
            cwd,
            env,
            onStdout: (() => {
            const parse = makeLineStreamParser((evType, text) => {
              const sessionEventType = (evType === 'reasoning' || evType === 'thinking') ? 'reasoning.summary' : 'terminal.stdout';
              void appendAgentSessionEvent(vaultRoot, {
                sessionId,
                agentId: agent.id,
                taskId: sessionTaskId,
                type: sessionEventType,
                timestamp: new Date().toISOString(),
                text: `[${evType}] ${text}`,
              }).catch(() => {});
            }, (usage) => {
              void appendAgentSessionEvent(vaultRoot, {
                sessionId,
                agentId: agent.id,
                taskId: sessionTaskId,
                type: 'session.usage',
                timestamp: new Date().toISOString(),
                usage: {
                  ...usage,
                  model: usage.model ?? agent.model,
                },
              }).catch(() => {})
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
              taskId: sessionTaskId,
              type: 'terminal.stderr',
              timestamp: new Date().toISOString(),
              text: chunk,
            })
          },
          onClose: (code, signal) => {
            observer?.onClose(code)
            const runnerState = agentRunnerManager.getRunner(sessionId)
            const stopped = runnerState?.status === 'stopped'
            const stopReason = runnerState?.stopReason?.trim() ?? ''
            void appendAgentSessionEvent(vaultRoot, {
              sessionId,
              agentId: agent.id,
              taskId: sessionTaskId,
              type: stopped ? 'session.stopped' : code === 0 ? 'session.ended' : 'session.failed',
              timestamp: new Date().toISOString(),
              code,
              ...(stopped
                ? { text: stopReason.length > 0 ? stopReason : (signal ? `Session terminated by ${signal}.` : 'Session stopped.') }
                : signal
                  ? { text: `Session terminated by ${signal}.` }
                  : {}),
            })
            if (task) {
              void markAgentTaskSessionStopped(vaultRoot, agent.id, task.id, sessionId)
            }
          },
          onError: (error) => {
            observer?.onError(error)
            void appendAgentSessionEvent(vaultRoot, {
              sessionId,
              agentId: agent.id,
              taskId: sessionTaskId,
              type: 'session.failed',
              timestamp: new Date().toISOString(),
              text: error.message,
            })
            if (task) {
              void markAgentTaskSessionStopped(vaultRoot, agent.id, task.id, sessionId)
            }
          },
        })
        })()

    await appendAgentSessionEvent(vaultRoot, {
      sessionId,
      agentId: agent.id,
      taskId: sessionTaskId,
      type: 'session.started',
      timestamp: new Date().toISOString(),
      text: `Launch ${launchMode} via ${runtimeKind}: ${runner.command} ${runner.args.join(' ')}`,
    })
    if (!coordinatorChatSession && task) {
      await upsertAgentTaskSessionRecord(vaultRoot, {
        agentId: agent.id,
        taskId: task.id,
        sessionId: runner.sessionId,
        status: "active",
        updatedAt: new Date().toISOString(),
        ...(task.projectId ? { projectId: task.projectId } : {}),
      })
    }
    await observer?.onLaunchStarted()

    return {
      agentId: agent.id,
      taskId: sessionTaskId,
      coordinatorThreadId: coordinatorThread?.id ?? null,
      sessionId: runner.sessionId,
      runnerId: runner.id,
      runtimeKind,
      launchSurface,
      launchMode,
      command: runner.command,
      args: runner.args,
    };
  })
}
