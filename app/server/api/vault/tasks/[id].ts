import { assertMethod, createError, defineEventHandler, getMethod, getRouterParam, readBody } from "h3";

import type { TaskDispatchStatus } from "../../../../shared/vault/schema";
import { autoDispatchAssignedTask } from "../../../services/agents/dispatch";
import { assertWorkPolicy, findPolicyAgent, resolveWorkPolicyActor } from "../../../services/policy/work-policy";
import { deleteVaultTask } from "../../../services/vault/task-delete";
import { readAgentSessionUsage } from "../../../services/agents/session-events";
import { startTaskAutorun } from "../../../services/agents/autorun";
import { agentRunnerManager } from "../../../services/runners/manager";
import { writeAuditNote } from "../../../services/vault/audit-write";
import type { TaskFrontmatter } from "../../../services/vault/repository";
import { decideAutoAssignment } from "../../../services/vault/task-create";
import { patchTaskLifecycle, scheduleTaskLifecycle } from "../../../services/vault/task-lifecycle";
import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";
import { readTaskRoutingConfig } from "../../../services/settings/task-routing";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface TaskPatchBody {
  readonly actorId: string;
  readonly patch: Record<string, unknown>;
  readonly autoRun?: boolean;
}

export interface PatchVaultTaskDependencies {
  readonly patchTaskLifecycle?: typeof patchTaskLifecycle;
  readonly scheduleTaskLifecycle?: typeof scheduleTaskLifecycle;
  readonly startTaskAutorun?: typeof startTaskAutorun;
  readonly readCanonicalVaultReadModel?: typeof readCanonicalVaultReadModel;
  readonly resolveVaultWorkspaceRoot?: typeof resolveVaultWorkspaceRoot;
  readonly autoDispatchAssignedTask?: typeof autoDispatchAssignedTask;
  readonly writeAuditNote?: typeof writeAuditNote;
  readonly readAgentSessionUsage?: typeof readAgentSessionUsage;
  readonly listRunners?: typeof agentRunnerManager.getRunners;
}

function buildTaskAuditMessage(status: string): string | null {
  if (status === "review") return "task moved to review"
  if (status === "done") return "task marked done"
  if (status === "blocked") return "task blocked"
  if (status === "waiting-approval") return "approval requested"
  return null
}

function isHumanAssignmentWithoutClaim(args: {
  readonly actorIsAgent: boolean;
  readonly currentTask: { status: string; lockedBy: string | null } | undefined;
  readonly patch: Record<string, unknown>;
  readonly assignedAgentId?: string | null;
}): boolean {
  if (args.actorIsAgent) return false;
  const explicitAssignee = typeof args.patch.assignee === "string" && args.patch.assignee.trim().length > 0
    ? args.patch.assignee.trim()
    : null;
  if (explicitAssignee === null && (!args.assignedAgentId || args.assignedAgentId.trim().length === 0)) return false;
  if (args.patch.status !== undefined && args.patch.status !== "todo") return false;
  return args.currentTask?.status === "todo" || args.currentTask?.status === "scheduled" || args.currentTask?.status === "review";
}

export async function patchVaultTask(
  taskId: string,
  body: TaskPatchBody,
  dependencies: PatchVaultTaskDependencies = {},
) {
  const runPatchTaskLifecycle = dependencies.patchTaskLifecycle ?? patchTaskLifecycle;
  const runScheduleTaskLifecycle = dependencies.scheduleTaskLifecycle ?? scheduleTaskLifecycle;
  const runStartTaskAutorun = dependencies.startTaskAutorun ?? startTaskAutorun;
  const runReadCanonicalVaultReadModel = dependencies.readCanonicalVaultReadModel ?? readCanonicalVaultReadModel;
  const runResolveVaultWorkspaceRoot = dependencies.resolveVaultWorkspaceRoot ?? resolveVaultWorkspaceRoot;
  const runAutoDispatchAssignedTask = dependencies.autoDispatchAssignedTask ?? autoDispatchAssignedTask;
  const runWriteAuditNote = dependencies.writeAuditNote ?? writeAuditNote;
  const runReadAgentSessionUsage = dependencies.readAgentSessionUsage ?? readAgentSessionUsage;
  const listRunners = dependencies.listRunners ?? agentRunnerManager.getRunners.bind(agentRunnerManager);

  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  if (typeof body.actorId !== "string" || body.actorId.trim().length === 0 || !isPlainRecord(body.patch)) {
    throw createError({ statusCode: 400, statusMessage: "actorId and patch are required." });
  }

  if (typeof body.patch.rateLimitedUntil === "string") {
    if (Number.isNaN(Date.parse(body.patch.rateLimitedUntil))) {
      throw createError({ statusCode: 400, statusMessage: "rateLimitedUntil must be an ISO-8601 timestamp." });
    }

    return runScheduleTaskLifecycle({
      taskId,
      actorId: body.actorId,
      nextRunAt: body.patch.rateLimitedUntil,
    });
  }

  const needsPermissionContext = typeof body.patch.status === "string" || typeof body.patch.assignee === "string";

  if (needsPermissionContext) {
    const vaultRoot = runResolveVaultWorkspaceRoot();
    const readModel = await runReadCanonicalVaultReadModel(vaultRoot);
    const routingConfig = await readTaskRoutingConfig(vaultRoot);
    const currentTask = readModel.tasks.find((t) => t.id === taskId);
    const actor = resolveWorkPolicyActor(readModel, body.actorId)
    const actorIsAgent = actor.kind !== "human";

    if (body.patch.status === "done") {
      assertWorkPolicy({ actorId: body.actorId, action: "finalize", readModel, task: currentTask })
    }
    if (currentTask?.status === "review" && body.patch.status === "todo") {
      assertWorkPolicy({ actorId: body.actorId, action: "finalize", readModel, task: currentTask })
    }
    if (typeof body.patch.assignee === "string" && body.patch.assignee.trim().length > 0 && body.patch.assignee !== "unassigned") {
      assertWorkPolicy({
        actorId: body.actorId,
        action: "assign",
        readModel,
        task: currentTask,
        assigneeId: body.patch.assignee,
        assignee: findPolicyAgent(readModel, body.patch.assignee),
      })
    }

    const assigneePatch = typeof body.patch.assignee === 'string' ? body.patch.assignee : null
    const routedAssignment = currentTask && (assigneePatch === null || assigneePatch === 'unassigned')
      ? decideAutoAssignment({
          projectId: currentTask.projectId,
          assignee: assigneePatch,
          requiredCapability: null,
          tags: Array.isArray(body.patch.tags) ? body.patch.tags.filter((tag): tag is string => typeof tag === 'string') : currentTask.tags,
        }, readModel, new Date(), routingConfig)
      : null
    const effectiveAssigneePatch = routedAssignment?.assignee && routedAssignment.assignee !== 'unassigned'
      ? routedAssignment.assignee
      : assigneePatch
    const assignedAgentId = assigneePatch !== null && assigneePatch.trim().length > 0 && assigneePatch !== 'unassigned'
      ? assigneePatch.trim()
      : effectiveAssigneePatch !== null && effectiveAssigneePatch.trim().length > 0 && effectiveAssigneePatch !== 'unassigned'
        ? effectiveAssigneePatch.trim()
      : null
    const isHumanFinalDisposition = !actorIsAgent
      && (body.patch.status === "done" || body.patch.status === "todo");
    const releaseLock = isHumanAssignmentWithoutClaim({
      actorIsAgent,
      currentTask: currentTask ? { status: currentTask.status, lockedBy: currentTask.lockedBy } : undefined,
      patch: body.patch,
      assignedAgentId,
    });
    const recoverStaleLock = isHumanFinalDisposition || releaseLock

    const result = await runPatchTaskLifecycle({
      taskId,
      actorId: body.actorId,
      patch: {
        ...body.patch,
        ...(effectiveAssigneePatch !== null ? { assignee: effectiveAssigneePatch } : {}),
        ...(releaseLock && assignedAgentId !== null ? {
          dispatch_status: 'checking',
          dispatch_reason: routedAssignment?.reason ?? 'Assigned and queued for dispatcher evaluation.',
          last_dispatch_attempt_at: new Date().toISOString(),
        } : {}),
      },
      ...(recoverStaleLock ? { recoverStaleLock: true } : {}),
      ...(releaseLock ? { releaseLock: true } : {}),
    });

    const taskAuditMessage = typeof body.patch.status === "string" ? buildTaskAuditMessage(body.patch.status) : null
    if (taskAuditMessage !== null) {
      const latestSession = listRunners()
        .filter((runner) => runner.taskId === taskId)
        .sort((left, right) => right.startTime.localeCompare(left.startTime))[0]
      const sessionUsage = latestSession
        ? await runReadAgentSessionUsage(runResolveVaultWorkspaceRoot(), latestSession.sessionId).catch(() => null)
        : null

      await runWriteAuditNote({
        vaultRoot: runResolveVaultWorkspaceRoot(),
        taskId,
        source: body.actorId,
        message: taskAuditMessage,
        promptTokens: sessionUsage?.promptTokens,
        completionTokens: sessionUsage?.completionTokens,
        tokensUsed: sessionUsage?.totalTokens ?? result.frontmatter.tokens_used,
        model: sessionUsage?.model ?? result.frontmatter.model,
        costUsd: sessionUsage?.costUsd ?? result.frontmatter.cost_usd,
        usageSource: sessionUsage?.usageSource,
      }).catch(() => undefined)
    }

    if (body.autoRun === true) {
      const runner = await runStartTaskAutorun(taskId);
      return { ...result, autoRun: { started: true, ...runner } };
    }

    if (releaseLock && assignedAgentId !== null) {
      const nextReadModel = await runReadCanonicalVaultReadModel(vaultRoot)
      const dispatch = await runAutoDispatchAssignedTask({
        readModel: nextReadModel,
        taskId,
        agentId: assignedAgentId,
        launchSurface: 'background',
        vaultRoot,
      })

      const dispatchPatch: Readonly<Partial<TaskFrontmatter>> = dispatch.launched
        ? { dispatch_status: 'started', dispatch_reason: 'Background session started automatically.', last_dispatch_attempt_at: new Date().toISOString() }
        : { dispatch_status: (dispatch.decision.status === 'ready' ? 'ready' : 'blocked') satisfies TaskDispatchStatus, dispatch_reason: dispatch.decision.reason, last_dispatch_attempt_at: new Date().toISOString() }

      const dispatchResult = await runPatchTaskLifecycle({
        taskId,
        actorId: dispatch.launched ? assignedAgentId : body.actorId,
        patch: dispatchPatch,
        releaseLock: dispatch.launched ? false : true,
      })

      return { ...dispatchResult, autoDispatch: dispatch }
    }

    return result;
  }

  const result = await runPatchTaskLifecycle({
    taskId,
    actorId: body.actorId,
    patch: body.patch,
  });

  if (body.autoRun === true) {
    const runner = await runStartTaskAutorun(taskId);
    return { ...result, autoRun: { started: true, ...runner } };
  }

  return result;
}

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  if (method !== "PATCH" && method !== "DELETE") {
    assertMethod(event, "PATCH");
  }

  const taskId = getRouterParam(event, "id");
  const body = await readBody(event);

  if (method === "DELETE") {
    if (!isPlainRecord(body) || typeof body.actorId !== "string" || body.actorId.trim().length === 0) {
      throw createError({ statusCode: 400, statusMessage: "actorId is required." });
    }

    return await deleteVaultTask(taskId ?? "", { actorId: body.actorId.trim() });
  }

  if (!isPlainRecord(body) || typeof body.actorId !== "string" || body.actorId.trim().length === 0 || !isPlainRecord(body.patch)) {
    throw createError({ statusCode: 400, statusMessage: "actorId and patch are required." });
  }

  return await patchVaultTask(taskId ?? "", {
    actorId: body.actorId,
    patch: body.patch,
    ...(body.autoRun === true ? { autoRun: true } : {}),
  });
});
