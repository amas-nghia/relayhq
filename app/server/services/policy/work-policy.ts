import { createError } from "h3"

import type { ReadModelAgent, ReadModelTask, VaultReadModel } from "../../models/read-model"

const COORDINATOR_TASK_TAGS = ["coordination", "orchestration", "project-coordinator"] as const

export type WorkPolicyAction = "assign" | "execute" | "auto-dispatch" | "coordinate" | "finalize" | "request-approval" | "approve" | "reject" | "stop"
export type WorkPolicyActorKind = "human" | "coordinator" | "worker"
export type WorkPolicyActorIntent = "auto" | "human" | "agent" | "system"

export interface WorkPolicyActor {
  readonly id: string
  readonly kind: WorkPolicyActorKind
  readonly agent: ReadModelAgent | null
}

export interface WorkPolicyDecision {
  readonly allowed: boolean
  readonly statusCode: number
  readonly statusMessage: string
}

export interface WorkPolicyContext {
  readonly actorId: string
  readonly action: WorkPolicyAction
  readonly actorIntent?: WorkPolicyActorIntent
  readonly readModel?: Pick<VaultReadModel, "agents">
  readonly task?: (Pick<ReadModelTask, "id" | "tags" | "status" | "approvalNeeded" | "approvalOutcome"> & { readonly assignee?: string | null }) | null
  readonly assigneeId?: string | null
  readonly assignee?: Pick<ReadModelAgent, "id" | "role" | "roles" | "aliases"> | null
  readonly sessionAgentId?: string | null
}

function isCoordinatorRole(agent: Pick<ReadModelAgent, "role" | "roles">): boolean {
  return agent.role === "coordinator" || (Array.isArray(agent.roles) && agent.roles.includes("coordinator"))
}

function isLegacyAgentId(actorId: string): boolean {
  const normalized = actorId.trim().toLowerCase()
  return normalized.startsWith("agent-") || normalized.startsWith("worker-") || normalized.startsWith("coordinator-")
}

function isLegacyCoordinatorId(actorId: string): boolean {
  const normalized = actorId.trim().toLowerCase()
  return normalized.includes("coordinator") || normalized.includes("orchestrator")
}

function findActorAgent(readModel: Pick<VaultReadModel, "agents"> | undefined, actorId: string): ReadModelAgent | null {
  return readModel?.agents.find((agent) => agent.id === actorId || (agent.aliases ?? []).includes(actorId)) ?? null
}

function isAssignedActor(context: WorkPolicyContext): boolean {
  const assignee = typeof context.task?.assignee === "string" ? context.task.assignee.trim() : ""
  if (assignee.length === 0 || assignee === "unassigned") return false
  return assignee === context.actorId.trim()
}

export function resolveWorkPolicyActor(readModel: Pick<VaultReadModel, "agents"> | undefined, actorId: string, context?: WorkPolicyContext): WorkPolicyActor {
  const agent = findActorAgent(readModel, actorId)
  if (agent === null) {
    if (isLegacyAgentId(actorId)) {
      return { id: actorId, kind: isLegacyCoordinatorId(actorId) ? "coordinator" : "worker", agent: null }
    }
    if (context && context.actorIntent !== "agent" && isAssignedActor(context)) {
      return { id: actorId, kind: isLegacyCoordinatorId(actorId) ? "coordinator" : "worker", agent: null }
    }
    return { id: actorId, kind: "human", agent: null }
  }
  return { id: agent.id, kind: isCoordinatorRole(agent) ? "coordinator" : "worker", agent }
}

function isSystemActor(actorId: string): boolean {
  return actorId.startsWith("@relayhq-")
}

function inferActorIntent(context: WorkPolicyContext): WorkPolicyActorIntent {
  if (context.actorIntent) return context.actorIntent
  return isSystemActor(context.actorId) ? "system" : "auto"
}

export function isCoordinatorAgent(agent: Pick<ReadModelAgent, "role" | "roles">): boolean {
  return isCoordinatorRole(agent)
}

export function isCoordinatorTask(task: Pick<ReadModelTask, "tags">): boolean {
  return Array.isArray(task.tags) && COORDINATOR_TASK_TAGS.every((tag) => task.tags.includes(tag))
}

export function canCoordinatorRunTask(agent: Pick<ReadModelAgent, "role" | "roles">, task: Pick<ReadModelTask, "tags">): boolean {
  return !isCoordinatorAgent(agent) || isCoordinatorTask(task)
}

export function findPolicyAgent(readModel: Pick<VaultReadModel, "agents">, agentId: string): ReadModelAgent | null {
  const normalized = agentId.trim()
  return readModel.agents.find((agent) => agent.id === normalized || (agent.aliases ?? []).includes(normalized)) ?? null
}

function resolvePolicyAssignee(context: WorkPolicyContext): WorkPolicyActor | null {
  if (context.assignee) {
    return { id: context.assignee.id, kind: isCoordinatorRole(context.assignee) ? "coordinator" : "worker", agent: context.assignee as ReadModelAgent }
  }

  const assigneeId = context.assigneeId?.trim()
  if (!assigneeId || assigneeId === "unassigned") return null
  return resolveWorkPolicyActor(context.readModel, assigneeId)
}

function allow(statusMessage = "Policy check passed."): WorkPolicyDecision {
  return { allowed: true, statusCode: 200, statusMessage }
}

function deny(statusCode: number, statusMessage: string): WorkPolicyDecision {
  return { allowed: false, statusCode, statusMessage }
}

export function evaluateWorkPolicy(context: WorkPolicyContext): WorkPolicyDecision {
  const actor = resolveWorkPolicyActor(context.readModel, context.actorId, context)
  const actorIntent = inferActorIntent(context)
  const task = context.task ?? null

  if (actorIntent === "agent" && actor.kind === "human" && context.action !== "request-approval") {
    return deny(404, `Agent ${context.actorId} was not found. Register the agent or use a human actor for this action.`)
  }

  if (context.action === "coordinate") {
    if (actor.kind === "human") {
      return deny(403, `Human actor ${actor.id} cannot execute coordinator chat as an agent. Open the project chat UI or launch a coordinator agent.`)
    }
    if (actor.kind !== "coordinator") {
      return deny(403, `Worker agent ${actor.id} cannot execute coordinator chat. Use a coordinator agent for orchestration.`)
    }
    return allow()
  }

  if (context.action === "assign") {
    const assignee = resolvePolicyAssignee(context)
    if (assignee?.kind === "coordinator" && task && !isCoordinatorTask(task)) {
      return deny(409, `Coordinator agent ${assignee.id} cannot be assigned to normal implementation task ${task.id}. Assign a worker agent or tag the task as coordination/orchestration/project-coordinator.`)
    }
    return allow()
  }

  if (context.action === "execute") {
    if (actor.kind === "human") {
      return deny(403, `Human actor ${actor.id} cannot execute task ${task?.id ?? "unknown"} as an agent. Assign and launch a worker agent instead.`)
    }
    if (actor.kind === "coordinator" && task && !isCoordinatorTask(task)) {
      return deny(409, coordinatorTaskPolicyReason(actor.id, task.id))
    }
    const assignee = typeof task?.assignee === "string" ? task.assignee.trim() : ""
    const normalizedAssignee = assignee === "unassigned" ? "" : assignee
    if (task && normalizedAssignee.length > 0 && normalizedAssignee !== actor.id && !(actor.agent?.aliases.includes(normalizedAssignee) ?? false)) {
      return deny(409, `Task ${task.id} is assigned to ${task.assignee}, not ${actor.id}.`)
    }
    return allow()
  }

  if (context.action === "auto-dispatch") {
    const executeDecision = evaluateWorkPolicy({ ...context, action: "execute" })
    if (!executeDecision.allowed) return executeDecision
    if (actor.kind === "coordinator") {
      return deny(409, coordinatorManualLaunchReason())
    }
    return allow()
  }

  if (context.action === "finalize") {
    if (actorIntent === "system") {
      return deny(403, `System actor ${actor.id} cannot finalize task ${task?.id ?? "unknown"} as done. A human must mark it done.`)
    }
    if (actor.kind !== "human") {
      return deny(403, `Agent ${actor.id} cannot finalize task ${task?.id ?? "unknown"} as done. Move work to review or request approval; a human must mark it done.`)
    }
    if (task?.approvalNeeded && task.approvalOutcome !== "approved") {
      return deny(409, `Task ${task.id} still requires human approval before it can be finalized. Approve or reject the pending approval first.`)
    }
    return allow()
  }

  if (context.action === "request-approval") {
    if (actorIntent === "system") {
      return deny(403, `System actor ${actor.id} cannot request approval for task ${task?.id ?? "unknown"}; the worker agent must request approval with a reason.`)
    }
    if (actor.kind === "human") {
      return deny(403, `Human actor ${actor.id} cannot request task approval as an agent. Move the task directly through the human approval path instead.`)
    }
    return allow()
  }

  if (context.action === "approve" || context.action === "reject") {
    if (actorIntent === "system") {
      return deny(403, `System actor ${actor.id} cannot ${context.action} task ${task?.id ?? "unknown"}. Human approval is required.`)
    }
    if (actor.kind !== "human") {
      return deny(403, `Agent ${actor.id} cannot ${context.action} task ${task?.id ?? "unknown"}. Human approval is required.`)
    }
    return allow()
  }

  if (context.action === "stop") {
    if (actor.kind !== "human" && context.sessionAgentId && context.sessionAgentId !== actor.id && !(actor.agent?.aliases.includes(context.sessionAgentId) ?? false)) {
      return deny(403, `Agent ${actor.id} cannot stop session owned by ${context.sessionAgentId}. Ask a human to stop it.`)
    }
    return allow()
  }

  return allow()
}

export function assertWorkPolicy(context: WorkPolicyContext): void {
  const decision = evaluateWorkPolicy(context)
  if (decision.allowed) return
  throw createError({ statusCode: decision.statusCode, statusMessage: decision.statusMessage })
}

export function coordinatorManualLaunchReason(): string {
  return "Coordinator sessions are started on demand to preserve tokens."
}

export function coordinatorTaskPolicyReason(agentId: string, taskId: string): string {
  return `Coordinator agent ${agentId} cannot receive or execute normal implementation task ${taskId}. Assign a worker agent, or tag the task as ${COORDINATOR_TASK_TAGS.join("/")} for coordination-only work.`
}
