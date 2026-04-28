import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { autoDispatchAssignedTask } from "../../../services/agents/dispatch";
import { startTaskAutorun } from "../../../services/agents/autorun";
import { patchTaskLifecycle, scheduleTaskLifecycle } from "../../../services/vault/task-lifecycle";
import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

// Transitions that require a human actor (not a registered agent).
// review→done: human approves the work as complete.
// review→todo: human rejects/reopens for rework.
const HUMAN_ONLY_TRANSITIONS: ReadonlyArray<{ from: string; to: string }> = [
  { from: "review", to: "done" },
  { from: "review", to: "todo" },
];

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
}

function isHumanAssignmentWithoutClaim(args: {
  readonly actorIsAgent: boolean;
  readonly currentTask: { status: string; lockedBy: string | null } | undefined;
  readonly patch: Record<string, unknown>;
}): boolean {
  if (args.actorIsAgent) return false;
  if (typeof args.patch.assignee !== "string" || args.patch.assignee.trim().length === 0) return false;
  if (args.patch.status !== undefined && args.patch.status !== "todo") return false;
  if (args.currentTask?.lockedBy !== null && args.currentTask?.lockedBy !== undefined) return false;
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
      reason: typeof body.patch.blocked_reason === "string" ? body.patch.blocked_reason : "Rate limited",
    });
  }

  const needsPermissionContext = typeof body.patch.status === "string" || typeof body.patch.assignee === "string";

  if (needsPermissionContext) {
    const vaultRoot = runResolveVaultWorkspaceRoot();
    const readModel = await runReadCanonicalVaultReadModel(vaultRoot);
    const agentIds = new Set(readModel.agents.map((a) => a.id));
    const currentTask = readModel.tasks.find((t) => t.id === taskId);
    const actorIsAgent = agentIds.has(body.actorId);

    if (typeof body.patch.status === "string" && actorIsAgent) {
      const currentStatus = currentTask?.status ?? "";
      const nextStatus = body.patch.status as string;

      const blocked = HUMAN_ONLY_TRANSITIONS.some((t) => t.from === currentStatus && t.to === nextStatus);
      if (blocked) {
        throw createError({
          statusCode: 403,
          statusMessage: `Agents cannot move tasks from "${currentStatus}" to "${nextStatus}". Only humans can perform this transition.`,
        });
      }
    }

    const isHumanFinalDisposition = !actorIsAgent
      && (body.patch.status === "done" || body.patch.status === "todo");
    const releaseLock = isHumanAssignmentWithoutClaim({
      actorIsAgent,
      currentTask: currentTask ? { status: currentTask.status, lockedBy: currentTask.lockedBy } : undefined,
      patch: body.patch,
    });
    const assignedAgentId = typeof body.patch.assignee === 'string' && body.patch.assignee.trim().length > 0 && body.patch.assignee !== 'unassigned'
      ? body.patch.assignee.trim()
      : null

    const result = await runPatchTaskLifecycle({
      taskId,
      actorId: body.actorId,
      patch: {
        ...body.patch,
        ...(releaseLock && assignedAgentId !== null ? {
          dispatch_status: 'checking',
          dispatch_reason: 'Assigned and queued for dispatcher evaluation.',
          last_dispatch_attempt_at: new Date().toISOString(),
        } : {}),
      },
      ...(isHumanFinalDisposition ? { recoverStaleLock: true } : {}),
      ...(releaseLock ? { releaseLock: true } : {}),
    });

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

      const dispatchPatch = dispatch.launched
        ? { dispatch_status: 'started', dispatch_reason: 'Background session started automatically.', last_dispatch_attempt_at: new Date().toISOString() }
        : { dispatch_status: dispatch.decision.status === 'ready' ? 'ready' : 'blocked', dispatch_reason: dispatch.decision.reason, last_dispatch_attempt_at: new Date().toISOString() }

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
  assertMethod(event, "PATCH");

  const taskId = getRouterParam(event, "id");
  const body = await readBody(event);

  if (!isPlainRecord(body) || typeof body.actorId !== "string" || body.actorId.trim().length === 0 || !isPlainRecord(body.patch)) {
    throw createError({ statusCode: 400, statusMessage: "actorId and patch are required." });
  }

  return await patchVaultTask(taskId ?? "", {
    actorId: body.actorId,
    patch: body.patch,
    ...(body.autoRun === true ? { autoRun: true } : {}),
  });
});
