import { createError, defineEventHandler, readBody } from "h3";

import type { ReadModelApproval, ReadModelBoard, ReadModelProject, ReadModelTask, VaultReadModel } from "../../models/read-model";
import { resolveKiokuRetrieval } from "../../services/kioku/retriever";
import { getKiokuStorage, KiokuSearchQueryError, type KiokuStorage } from "../../services/kioku/storage";
import { syncReadModelToKioku } from "../../services/kioku/sync";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export interface KiokuSearchProject {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly boardIds: ReadonlyArray<string>;
  readonly taskIds: ReadonlyArray<string>;
  readonly approvalIds: ReadonlyArray<string>;
  readonly updatedAt: string;
}

export interface KiokuSearchBoard {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly name: string;
  readonly columnIds: ReadonlyArray<string>;
  readonly taskIds: ReadonlyArray<string>;
  readonly approvalIds: ReadonlyArray<string>;
  readonly updatedAt: string;
}

export interface KiokuSearchTask {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly boardId: string;
  readonly columnId: string;
  readonly status: string;
  readonly priority: string;
  readonly title: string;
  readonly assignee: string;
  readonly progress: number;
  readonly approvalNeeded: boolean;
  readonly approvalOutcome: string;
  readonly dependsOn: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly updatedAt: string;
  readonly isStale: boolean;
}

export interface KiokuSearchApproval {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly boardId: string;
  readonly taskId: string;
  readonly status: string;
  readonly outcome: string;
  readonly requestedAt: string | null;
  readonly decidedAt: string | null;
  readonly updatedAt: string;
}

export interface KiokuSearchResponse {
  readonly query: string;
  readonly hits: ReturnType<typeof resolveKiokuRetrieval>["hits"];
  readonly projects: ReadonlyArray<KiokuSearchProject>;
  readonly boards: ReadonlyArray<KiokuSearchBoard>;
  readonly tasks: ReadonlyArray<KiokuSearchTask>;
  readonly approvals: ReadonlyArray<KiokuSearchApproval>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSearchQuery(body: unknown): string {
  if (!isPlainRecord(body) || typeof body.query !== "string" || body.query.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "query is required and must be a non-empty string." });
  }

  return body.query.trim();
}

function sanitizeProject(project: ReadModelProject): KiokuSearchProject {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    boardIds: project.boardIds,
    taskIds: project.taskIds,
    approvalIds: project.approvalIds,
    updatedAt: project.updatedAt,
  };
}

function sanitizeBoard(board: ReadModelBoard): KiokuSearchBoard {
  return {
    id: board.id,
    workspaceId: board.workspaceId,
    projectId: board.projectId,
    name: board.name,
    columnIds: board.columnIds,
    taskIds: board.taskIds,
    approvalIds: board.approvalIds,
    updatedAt: board.updatedAt,
  };
}

function sanitizeTask(task: ReadModelTask): KiokuSearchTask {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    projectId: task.projectId,
    boardId: task.boardId,
    columnId: task.columnId,
    status: task.status,
    priority: task.priority,
    title: task.title,
    assignee: task.assignee,
    progress: task.progress,
    approvalNeeded: task.approvalNeeded,
    approvalOutcome: task.approvalOutcome,
    dependsOn: task.dependsOn,
    tags: task.tags,
    updatedAt: task.updatedAt,
    isStale: task.isStale,
  };
}

function sanitizeApproval(approval: ReadModelApproval): KiokuSearchApproval {
  return {
    id: approval.id,
    workspaceId: approval.workspaceId,
    projectId: approval.projectId,
    boardId: approval.boardId,
    taskId: approval.taskId,
    status: approval.status,
    outcome: approval.outcome,
    requestedAt: approval.requestedAt,
    decidedAt: approval.decidedAt,
    updatedAt: approval.updatedAt,
  };
}

export async function searchKiokuCanonicalState(
  query: string,
  options: {
    readonly readModel: VaultReadModel;
    readonly storage: Pick<KiokuStorage, "search" | "upsert" | "deleteById" | "listEntityIds" | "fetchById">;
  },
) {
  syncReadModelToKioku(options.readModel, options.storage);
  const hits = options.storage.search(query);
  const resolved = resolveKiokuRetrieval(options.readModel, hits, query);

  return {
    query: resolved.query,
    hits: resolved.hits,
    projects: resolved.projects.map(sanitizeProject),
    boards: resolved.boards.map(sanitizeBoard),
    tasks: resolved.tasks.map(sanitizeTask),
    approvals: resolved.approvals.map(sanitizeApproval),
  } satisfies KiokuSearchResponse;
}

export default defineEventHandler(async (event) => {
  const query = readSearchQuery(await readBody(event));

  try {
    const readModel = await readCanonicalVaultReadModel(resolveVaultWorkspaceRoot());
    return await searchKiokuCanonicalState(query, {
      readModel,
      storage: getKiokuStorage(),
    });
  } catch (error) {
    if (error instanceof KiokuSearchQueryError) {
      throw createError({ statusCode: 400, statusMessage: error.message });
    }

    throw createError({
      statusCode: 503,
      statusMessage: error instanceof Error ? error.message : "Kioku search is unavailable.",
    });
  }
});
