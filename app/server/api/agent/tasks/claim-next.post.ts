import { createError, defineEventHandler, readBody } from "h3";

import type { TaskPriority } from "../../../../shared/vault/schema";
import { filterVaultReadModelByWorkspaceId, type VaultReadModel } from "../../../models/read-model";
import { claimTaskLifecycle } from "../../../services/vault/task-lifecycle";
import { VaultLockError, VaultStaleWriteError } from "../../../services/vault/lock";
import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";
import { readTaskBootstrapPack, type BootstrapPack } from "../bootstrap/[taskId].get";

const PRIORITY_ORDER: Readonly<Record<TaskPriority, number>> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

interface ClaimNextRequestBody {
  readonly agentId: string;
  readonly boardId?: string;
  readonly priority?: TaskPriority;
}

interface ClaimNextAgentTaskOptions {
  readonly vaultRoot?: string;
  readonly now?: Date;
  readonly readModelReader?: (vaultRoot: string) => Promise<VaultReadModel>;
}

export interface ClaimNextAgentTaskResponse {
  readonly claimed: BootstrapPack | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseClaimNextBody(body: unknown): ClaimNextRequestBody {
  if (!isPlainRecord(body) || typeof body.agentId !== "string" || body.agentId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "agentId is required." });
  }

  return {
    agentId: body.agentId.trim(),
    boardId: typeof body.boardId === "string" && body.boardId.trim().length > 0 ? body.boardId.trim() : undefined,
    priority: typeof body.priority === "string" ? body.priority as TaskPriority : undefined,
  };
}

function isClaimableByAgent(task: VaultReadModel["tasks"][number], agentId: string): boolean {
  return task.status === "todo" && (task.assignee.trim().length === 0 || task.assignee === agentId);
}

function sortClaimCandidates(left: VaultReadModel["tasks"][number], right: VaultReadModel["tasks"][number]): number {
  return PRIORITY_ORDER[left.priority]
    - PRIORITY_ORDER[right.priority]
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id);
}

function isUnavailableClaimError(error: unknown): boolean {
  return error instanceof VaultLockError
    || error instanceof VaultStaleWriteError
    || (typeof error === "object" && error !== null && "statusCode" in error && (error as { statusCode?: number }).statusCode === 409);
}

export async function claimNextAgentTask(
  body: unknown,
  options: ClaimNextAgentTaskOptions = {},
): Promise<ClaimNextAgentTaskResponse> {
  const request = parseClaimNextBody(body);
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const readModelReader = options.readModelReader ?? readCanonicalVaultReadModel;
  const readModel = await readModelReader(vaultRoot);
  const workspaceId = normalizeConfiguredWorkspaceId(readConfiguredWorkspaceId(), readModel.workspaces);
  const filteredReadModel = workspaceId === null
    ? readModel
    : filterVaultReadModelByWorkspaceId(readModel, workspaceId);

  const candidates = filteredReadModel.tasks
    .filter((task) => isClaimableByAgent(task, request.agentId))
    .filter((task) => request.boardId === undefined || task.boardId === request.boardId)
    .filter((task) => request.priority === undefined || task.priority === request.priority)
    .sort(sortClaimCandidates);

  for (const candidate of candidates) {
    try {
      await claimTaskLifecycle({
        taskId: candidate.id,
        actorId: request.agentId,
        assignee: request.agentId,
        vaultRoot,
        now: options.now,
        canClaim: (task) => {
          const currentAssignee = task.assignee.trim();
          const matchesBoard = request.boardId === undefined || task.board_id === request.boardId;
          const matchesPriority = request.priority === undefined || task.priority === request.priority;

          if (task.status !== "todo" || !matchesBoard || !matchesPriority || (currentAssignee.length > 0 && currentAssignee !== request.agentId)) {
            throw createError({ statusCode: 409, statusMessage: `Task ${candidate.id} is no longer claimable.` });
          }
        },
      });

      return {
        claimed: await readTaskBootstrapPack(candidate.id, {
          includeProtocol: true,
          inlineContextFiles: true,
          resolveRoot: () => vaultRoot,
        }),
      };
    } catch (error) {
      if (isUnavailableClaimError(error)) {
        continue;
      }

      throw error;
    }
  }

  return { claimed: null };
}

export default defineEventHandler(async (event) => {
  return await claimNextAgentTask(await readBody(event));
});
