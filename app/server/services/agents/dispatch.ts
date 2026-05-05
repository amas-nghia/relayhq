import type { ReadModelAgent, ReadModelTask, VaultReadModel } from "../../models/read-model";
import { findAgentForProject } from "../../models/read-model";
import type { TaskDispatchStatus } from "../../../shared/vault/schema";
import { agentRunnerManager } from "../runners/manager";
import { launchAgentSession, type LaunchAgentSessionResult } from "./launch";
import { readAgentRuntimeReadiness, type AgentRuntimeReadiness } from "./runtime-readiness";
import { findRuntimeCapacityBlocker, isRuntimeCapacityError } from "./capacity";
import { evaluateWorkPolicy } from "../policy/work-policy";
import { claimTaskLifecycle, patchTaskLifecycle, scheduleTaskLifecycle } from "../vault/task-lifecycle";
import { DEFAULT_RUNNER_STALE_AFTER_MS, isRunnerSessionLive, type AgentRunnerSummary } from "../runners/manager";

export type DispatchDecisionStatus = 'ready' | 'blocked';

export interface DispatchDecision {
  readonly status: DispatchDecisionStatus;
  readonly reason: string | null;
  readonly taskId: string;
  readonly agentId: string;
  readonly runtimeReadiness: AgentRuntimeReadiness;
  readonly nextAction: 'launch' | 'wait';
}

export interface DispatchExecutionResult {
  readonly decision: DispatchDecision;
  readonly launched: boolean;
  readonly launch?: LaunchAgentSessionResult;
}

interface PersistDispatchOutcomeOptions {
  readonly taskId: string;
  readonly actorId: string;
  readonly launched: boolean;
  readonly decision: DispatchDecision;
  readonly patchTaskLifecycleRunner?: typeof patchTaskLifecycle;
}

interface ReconcileLiveSessionsOptions {
  readonly readModel: VaultReadModel;
  readonly vaultRoot?: string;
  readonly activeSessionsReader?: typeof agentRunnerManager.getRunners;
  readonly claimTaskLifecycleRunner?: typeof claimTaskLifecycle;
}

interface EvaluateDispatchOptions {
  readonly readModel: VaultReadModel;
  readonly taskId: string;
  readonly agentId: string;
  readonly runtimeReadinessReader?: typeof readAgentRuntimeReadiness;
  readonly activeSessionsReader?: typeof agentRunnerManager.getRunners;
}

function findTask(readModel: VaultReadModel, taskId: string): ReadModelTask | null {
  return readModel.tasks.find((entry) => entry.id === taskId) ?? null
}

function findAgent(readModel: VaultReadModel, agentId: string, projectId?: string | null): ReadModelAgent | null {
  return findAgentForProject(readModel.agents, agentId, projectId ?? null)
}

function isCoordinatorAgent(agent: ReadModelAgent): boolean {
  return agent.role === 'coordinator' || (agent.roles ?? []).includes('coordinator')
}

function selectAgentForTask(task: ReadModelTask, readModel: VaultReadModel): ReadModelAgent | null {
  const taskTags = new Set(task.tags.map((t) => t.toLowerCase()))
  const activeLoads = new Map<string, number>()
  for (const t of readModel.tasks) {
    if (t.status === 'in-progress' || t.status === 'waiting-approval' || t.status === 'blocked') {
      activeLoads.set(t.assignee, (activeLoads.get(t.assignee) ?? 0) + 1)
    }
  }

  const scored = readModel.agents
    .filter((agent) => agent.status === 'available')
    .filter((agent) => !isCoordinatorAgent(agent))
    .map((agent) => {
      let score = 0
      for (const type of agent.taskTypesAccepted) {
        if (taskTags.has(type.toLowerCase())) score += 2
      }
      for (const cap of agent.capabilities) {
        if (taskTags.has(cap.toLowerCase())) score += 1
      }
      return { agent, score, load: activeLoads.get(agent.id) ?? 0 }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.load - b.load || a.agent.id.localeCompare(b.agent.id))

  return scored[0]?.agent ?? null
}

function taskDependsOnIncompleteWork(task: ReadModelTask, readModel: VaultReadModel): boolean {
  return task.dependsOn.some((dependencyId) => {
    const dependency = readModel.tasks.find((entry) => entry.id === dependencyId)
    return dependency !== undefined && dependency.status !== 'done'
  })
}

export function evaluateTaskDispatch(options: EvaluateDispatchOptions): DispatchDecision {
  const task = findTask(options.readModel, options.taskId)
  const agent = findAgent(options.readModel, options.agentId, task?.projectId)
  const runtimeReadinessReader = options.runtimeReadinessReader ?? readAgentRuntimeReadiness
  const activeSessionsReader = options.activeSessionsReader ?? agentRunnerManager.getRunners.bind(agentRunnerManager)

  if (!task || !agent) {
    return {
      status: 'blocked',
      reason: !task ? 'Task not found.' : 'Agent not found.',
      taskId: options.taskId,
      agentId: options.agentId,
      runtimeReadiness: agent ? runtimeReadinessReader(agent) : {
        agentId: options.agentId,
        runtimeKind: null,
        launchMode: null,
        verificationStatus: 'failed',
        installed: false,
        command: null,
        path: null,
        reason: 'Agent not found.',
      },
      nextAction: 'wait',
    }
  }

  const runtimeReadiness = runtimeReadinessReader(agent)

  if (task.status !== 'todo') {
    return { status: 'blocked', reason: `Task is ${task.status}, not todo.`, taskId: task.id, agentId: agent.id, runtimeReadiness, nextAction: 'wait' }
  }
  if (task.assignee.trim().length === 0 || (task.assignee !== agent.id && !agent.aliases.includes(task.assignee.trim()))) {
    return { status: 'blocked', reason: 'Task is not assigned to this agent.', taskId: task.id, agentId: agent.id, runtimeReadiness, nextAction: 'wait' }
  }
  if (task.lockedBy && task.lockedBy !== agent.id) {
    return { status: 'blocked', reason: `Task is locked by ${task.lockedBy}.`, taskId: task.id, agentId: agent.id, runtimeReadiness, nextAction: 'wait' }
  }
  if (task.blockedReason) {
    return { status: 'blocked', reason: task.blockedReason, taskId: task.id, agentId: agent.id, runtimeReadiness, nextAction: 'wait' }
  }
  if (task.approvalNeeded) {
    return { status: 'blocked', reason: 'Task requires approval before execution.', taskId: task.id, agentId: agent.id, runtimeReadiness, nextAction: 'wait' }
  }
  if (task.nextRunAt) {
    return { status: 'blocked', reason: `Task is scheduled for ${task.nextRunAt}.`, taskId: task.id, agentId: agent.id, runtimeReadiness, nextAction: 'wait' }
  }
  if (taskDependsOnIncompleteWork(task, options.readModel)) {
    return { status: 'blocked', reason: 'Task dependencies are not complete.', taskId: task.id, agentId: agent.id, runtimeReadiness, nextAction: 'wait' }
  }
  const policyDecision = evaluateWorkPolicy({ actorId: agent.id, actorIntent: 'agent', action: 'auto-dispatch', readModel: options.readModel, task })
  if (!policyDecision.allowed) {
    return { status: 'blocked', reason: policyDecision.statusMessage, taskId: task.id, agentId: agent.id, runtimeReadiness, nextAction: 'wait' }
  }
  if (runtimeReadiness.verificationStatus !== 'ready') {
    return { status: 'blocked', reason: runtimeReadiness.reason ?? 'Runtime is not ready.', taskId: task.id, agentId: agent.id, runtimeReadiness, nextAction: 'wait' }
  }

  const capacityBlocker = findRuntimeCapacityBlocker({
    readModel: options.readModel,
    taskId: task.id,
    activeSessionsReader,
  })
  if (capacityBlocker) {
    return { status: 'blocked', reason: capacityBlocker.reason, taskId: task.id, agentId: agent.id, runtimeReadiness, nextAction: 'wait' }
  }

  return {
    status: 'ready',
    reason: null,
    taskId: task.id,
    agentId: agent.id,
    runtimeReadiness,
    nextAction: 'launch',
  }
}

export async function autoDispatchAssignedTask(options: {
  readonly readModel: VaultReadModel;
  readonly taskId: string;
  readonly agentId: string;
  readonly launchSurface?: 'background' | 'visible-terminal';
  readonly runtimeReadinessReader?: typeof readAgentRuntimeReadiness;
  readonly activeSessionsReader?: typeof agentRunnerManager.getRunners;
  readonly launcher?: typeof launchAgentSession;
  readonly vaultRoot?: string;
}): Promise<DispatchExecutionResult> {
  const decision = evaluateTaskDispatch(options)
  if (decision.status !== 'ready') {
    return { decision, launched: false }
  }

  const launcher = options.launcher ?? launchAgentSession
  try {
    const launch = await launcher({
      agentId: options.agentId,
      taskId: options.taskId,
      mode: 'fresh',
      surface: options.launchSurface ?? 'background',
      ...(options.vaultRoot ? { vaultRoot: options.vaultRoot } : {}),
    })
    return { decision, launched: true, launch }
  } catch (error) {
    if (!isRuntimeCapacityError(error)) throw error
    return {
      decision: {
        ...decision,
        status: 'blocked',
        reason: error.statusMessage,
        nextAction: 'wait',
      },
      launched: false,
    }
  }
}

function toDispatchPatch(result: { readonly launched: boolean; readonly decision: DispatchDecision }) {
  return result.launched
    ? {
        dispatch_status: 'started' as const,
        dispatch_reason: 'Background session started automatically.',
        last_dispatch_attempt_at: new Date().toISOString(),
      }
    : {
        dispatch_status: (result.decision.status === 'ready' ? 'ready' : 'blocked') as TaskDispatchStatus,
        dispatch_reason: result.decision.reason,
        last_dispatch_attempt_at: new Date().toISOString(),
      }
}

async function persistDispatchOutcome(options: PersistDispatchOutcomeOptions): Promise<void> {
  const runPatchTaskLifecycle = options.patchTaskLifecycleRunner ?? patchTaskLifecycle
  await runPatchTaskLifecycle({
    taskId: options.taskId,
    actorId: options.launched ? options.decision.agentId : options.actorId,
    patch: toDispatchPatch({ launched: options.launched, decision: options.decision }),
    releaseLock: options.launched ? false : true,
    recoverStaleLock: true,
  })
}

export async function sweepAssignedTasksForDispatch(options: {
  readonly readModel: VaultReadModel;
  readonly vaultRoot?: string;
  readonly patchTaskLifecycleRunner?: typeof patchTaskLifecycle;
}): Promise<ReadonlyArray<DispatchExecutionResult>> {
  const runPatchTaskLifecycle = options.patchTaskLifecycleRunner ?? patchTaskLifecycle
  const results: DispatchExecutionResult[] = []
  for (const task of options.readModel.tasks) {
    if (task.status !== 'todo') continue
    let effectiveTask = task
    const isUnassigned = task.assignee.trim().length === 0 || task.assignee === 'unassigned'
    const assignedAgentMissing = !isUnassigned && findAgent(options.readModel, task.assignee) === null
    if (isUnassigned || assignedAgentMissing) {
      const selected = selectAgentForTask(task, options.readModel)
      if (!selected) continue
      try {
        await runPatchTaskLifecycle({
          taskId: task.id,
          actorId: '@relayhq-dispatcher',
          patch: { assignee: selected.id },
          ...(options.vaultRoot ? { vaultRoot: options.vaultRoot } : {}),
        })
        effectiveTask = { ...task, assignee: selected.id }
      } catch {
        continue
      }
    }

    // A todo task with next_run_at set is logically scheduled — move it to
    // status:scheduled so it appears in the scheduled lane, not the assigned lane.
    if (effectiveTask.nextRunAt) {
      try {
        await scheduleTaskLifecycle({
          taskId: effectiveTask.id,
          actorId: '@relayhq-dispatcher',
          nextRunAt: effectiveTask.nextRunAt,
          ...(options.vaultRoot ? { vaultRoot: options.vaultRoot } : {}),
        })
      } catch {
        // non-fatal — skip this task, scheduler will pick it up next cycle
      }
      continue
    }

    try {
      const result = await autoDispatchAssignedTask({
        readModel: options.readModel,
        taskId: effectiveTask.id,
        agentId: effectiveTask.assignee,
        launchSurface: 'background',
        ...(options.vaultRoot ? { vaultRoot: options.vaultRoot } : {}),
      })

      await persistDispatchOutcome({
        taskId: effectiveTask.id,
        actorId: '@relayhq-dispatcher',
        launched: result.launched,
        decision: result.decision,
        ...(options.patchTaskLifecycleRunner ? { patchTaskLifecycleRunner: options.patchTaskLifecycleRunner } : {}),
      })

      results.push(result)
    } catch (error) {
      const agent = findAgent(options.readModel, effectiveTask.assignee)
      const reason = error instanceof Error
        ? ('statusMessage' in error && typeof error.statusMessage === 'string' && error.statusMessage.trim().length > 0
            ? error.statusMessage
            : error.message)
        : 'Dispatcher sweep failed.'
      const decision: DispatchDecision = {
        status: 'blocked',
        reason,
        taskId: effectiveTask.id,
        agentId: effectiveTask.assignee,
        runtimeReadiness: agent ? readAgentRuntimeReadiness(agent) : {
          agentId: effectiveTask.assignee,
          runtimeKind: null,
          launchMode: null,
          verificationStatus: 'failed',
          installed: false,
          command: null,
          path: null,
          reason,
        },
        nextAction: 'wait',
      }

      try {
        await persistDispatchOutcome({
          taskId: effectiveTask.id,
          actorId: '@relayhq-dispatcher',
          launched: false,
          decision,
          ...(options.patchTaskLifecycleRunner ? { patchTaskLifecycleRunner: options.patchTaskLifecycleRunner } : {}),
        })
      } catch {
        // Ignore secondary persistence failures so one broken task does not stop the sweep loop.
      }

      results.push({ decision, launched: false })
    }
  }
  return results
}

export async function reconcileLiveSessionsWithTaskStatus(options: ReconcileLiveSessionsOptions): Promise<number> {
  const readSessions = options.activeSessionsReader ?? agentRunnerManager.getRunners.bind(agentRunnerManager)
  const runClaimTaskLifecycle = options.claimTaskLifecycleRunner ?? claimTaskLifecycle
  const vaultRoot = options.vaultRoot
  const nowMs = Date.now()
  const liveSessions = readSessions().filter((session) => isRunnerSessionLive(session, nowMs, DEFAULT_RUNNER_STALE_AFTER_MS))
  let reconciled = 0

  for (const session of liveSessions) {
    if (!session.taskId) continue
    const task = findTask(options.readModel, session.taskId)
    if (!task) continue
    if (task.status !== 'todo') continue
    const sessionAgent = findAgent(options.readModel, session.agentName)
    if (task.assignee !== session.agentName && task.assignee !== sessionAgent?.id && !(sessionAgent?.aliases.includes(task.assignee) ?? false)) continue
    const policyDecision = evaluateWorkPolicy({ actorId: session.agentName, actorIntent: 'agent', action: 'execute', readModel: options.readModel, task })
    if (!policyDecision.allowed) continue

    await runClaimTaskLifecycle({
      taskId: task.id,
      actorId: session.agentName,
      assignee: session.agentName,
      ...(vaultRoot ? { vaultRoot } : {}),
    })
    reconciled += 1
  }

  return reconciled
}
