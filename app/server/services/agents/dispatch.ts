import type { ReadModelAgent, ReadModelTask, VaultReadModel } from "../../models/read-model";
import { agentRunnerManager } from "../runners/manager";
import { launchAgentSession, type LaunchAgentSessionResult } from "./launch";
import { readAgentRuntimeReadiness, type AgentRuntimeReadiness } from "./runtime-readiness";

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

interface EvaluateDispatchOptions {
  readonly readModel: VaultReadModel;
  readonly taskId: string;
  readonly agentId: string;
  readonly runtimeReadinessReader?: typeof readAgentRuntimeReadiness;
  readonly activeSessionsReader?: typeof agentRunnerManager.getAgentRunners;
}

function findTask(readModel: VaultReadModel, taskId: string): ReadModelTask | null {
  return readModel.tasks.find((entry) => entry.id === taskId) ?? null
}

function findAgent(readModel: VaultReadModel, agentId: string): ReadModelAgent | null {
  return readModel.agents.find((entry) => entry.id === agentId || entry.aliases.includes(agentId)) ?? null
}

function taskDependsOnIncompleteWork(task: ReadModelTask, readModel: VaultReadModel): boolean {
  return task.dependsOn.some((dependencyId) => {
    const dependency = readModel.tasks.find((entry) => entry.id === dependencyId)
    return dependency !== undefined && dependency.status !== 'done'
  })
}

export function evaluateTaskDispatch(options: EvaluateDispatchOptions): DispatchDecision {
  const task = findTask(options.readModel, options.taskId)
  const agent = findAgent(options.readModel, options.agentId)
  const runtimeReadinessReader = options.runtimeReadinessReader ?? readAgentRuntimeReadiness
  const activeSessionsReader = options.activeSessionsReader ?? agentRunnerManager.getAgentRunners.bind(agentRunnerManager)

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
  if (task.assignee.trim().length === 0 || task.assignee !== agent.id) {
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
  if (runtimeReadiness.verificationStatus !== 'ready') {
    return { status: 'blocked', reason: runtimeReadiness.reason ?? 'Runtime is not ready.', taskId: task.id, agentId: agent.id, runtimeReadiness, nextAction: 'wait' }
  }

  const activeSession = activeSessionsReader(agent.id).find((session) => session.status === 'running' || session.status === 'handed-off')
  if (activeSession) {
    return { status: 'blocked', reason: `Agent already has an active session (${activeSession.status}).`, taskId: task.id, agentId: agent.id, runtimeReadiness, nextAction: 'wait' }
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
  readonly activeSessionsReader?: typeof agentRunnerManager.getAgentRunners;
  readonly launcher?: typeof launchAgentSession;
  readonly vaultRoot?: string;
}): Promise<DispatchExecutionResult> {
  const decision = evaluateTaskDispatch(options)
  if (decision.status !== 'ready') {
    return { decision, launched: false }
  }

  const launcher = options.launcher ?? launchAgentSession
  const launch = await launcher({
    agentId: options.agentId,
    taskId: options.taskId,
    mode: 'fresh',
    surface: options.launchSurface ?? 'background',
    ...(options.vaultRoot ? { vaultRoot: options.vaultRoot } : {}),
  })
  return { decision, launched: true, launch }
}

export async function sweepAssignedTasksForDispatch(options: {
  readonly readModel: VaultReadModel;
  readonly vaultRoot?: string;
}): Promise<ReadonlyArray<DispatchExecutionResult>> {
  const results: DispatchExecutionResult[] = []
  for (const task of options.readModel.tasks) {
    if (task.status !== 'todo') continue
    if (task.assignee.trim().length === 0 || task.assignee === 'unassigned') continue
    const result = await autoDispatchAssignedTask({
      readModel: options.readModel,
      taskId: task.id,
      agentId: task.assignee,
      launchSurface: 'background',
      ...(options.vaultRoot ? { vaultRoot: options.vaultRoot } : {}),
    })
    results.push(result)
  }
  return results
}
