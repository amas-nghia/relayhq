import { assertMethod, createError, defineEventHandler, getRouterParam, readBody } from "h3";

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
}

export async function patchVaultTask(
  taskId: string,
  body: TaskPatchBody,
  dependencies: PatchVaultTaskDependencies = {},
) {
  const runPatchTaskLifecycle = dependencies.patchTaskLifecycle ?? patchTaskLifecycle;
  const runScheduleTaskLifecycle = dependencies.scheduleTaskLifecycle ?? scheduleTaskLifecycle;
  const runStartTaskAutorun = dependencies.startTaskAutorun ?? startTaskAutorun;

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

  // Permission check: some transitions are human-only.
  if (typeof body.patch.status === "string") {
    const vaultRoot = resolveVaultWorkspaceRoot();
    const readModel = await readCanonicalVaultReadModel(vaultRoot);
    const agentIds = new Set(readModel.agents.map((a) => a.id));

    if (agentIds.has(body.actorId)) {
      const currentTask = readModel.tasks.find((t) => t.id === taskId);
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

    const isHumanFinalDisposition = !agentIds.has(body.actorId)
      && (body.patch.status === "done" || body.patch.status === "todo");

    const result = await runPatchTaskLifecycle({
      taskId,
      actorId: body.actorId,
      patch: body.patch,
      ...(isHumanFinalDisposition ? { recoverStaleLock: true } : {}),
    });

    if (body.autoRun === true) {
      const runner = await runStartTaskAutorun(taskId);
      return { ...result, autoRun: { started: true, ...runner } };
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
