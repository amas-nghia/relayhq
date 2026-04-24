import { createError, defineEventHandler, readBody } from "h3";

import type { TaskPriority } from "../../../shared/vault/schema";
import { formatTaskInputIssues, validateTaskInput } from "../../services/vault/task-input";
import { buildBody } from "../vault/tasks.post";
import { createVaultTask, TaskCreateError } from "../../services/vault/task-create";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

type TaskProposal = {
  readonly title: string;
  readonly priority: TaskPriority;
  readonly boardId: string;
  readonly columnId?: string;
  readonly assignee?: string;
  readonly objective?: string;
  readonly acceptanceCriteria?: ReadonlyArray<string>;
  readonly constraints?: ReadonlyArray<string>;
  readonly contextFiles?: ReadonlyArray<string>;
  readonly dependencies?: ReadonlyArray<string>;
  readonly sourceIssueId?: string;
};

type TaskCreateResponse = {
  readonly created: ReadonlyArray<{ id: string; title: string; warnings: ReadonlyArray<string> }>;
  readonly skipped: ReadonlyArray<{ title: string; reason: string }>;
  readonly errors: ReadonlyArray<{ title: string; error: string }>;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTitle(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalStringArray(value: unknown): ReadonlyArray<string> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? items : undefined;
}

function usesRawStructuredBody(objective: string | undefined): boolean {
  return typeof objective === "string" && /(^|\n)##\s+Acceptance Criteria\b/i.test(objective);
}

function buildProposalWarnings(proposal: TaskProposal): ReadonlyArray<string> {
  const warnings: string[] = [];
  const objectiveLength = proposal.objective?.trim().length ?? 0;

  if (objectiveLength < 20) {
    warnings.push("objective is missing or too short; workers may not understand the task goal.");
  }
  if ((proposal.acceptanceCriteria?.length ?? 0) === 0) {
    warnings.push("acceptanceCriteria is empty; workers may not know how completion will be judged.");
  }
  if ((proposal.constraints?.length ?? 0) === 0) {
    warnings.push("constraints is empty; workers may miss important scope or safety boundaries.");
  }
  if ((proposal.contextFiles?.length ?? 0) === 0) {
    warnings.push("contextFiles is empty; workers may need to rediscover the relevant files themselves.");
  }

  return warnings;
}

function parseProposal(value: unknown): TaskProposal {
  if (!isPlainRecord(value)) {
    throw createError({ statusCode: 422, statusMessage: "Each task proposal must be an object." });
  }

  const title = normalizeTitle(value.title);
  const priority = typeof value.priority === "string" ? value.priority : "";
  const boardId = typeof value.boardId === "string" ? value.boardId.trim() : "";

  if (!title || !priority || !boardId) {
    throw createError({ statusCode: 422, statusMessage: "title, priority, and boardId are required for each task proposal." });
  }

  return {
    title,
    priority: priority as TaskPriority,
    boardId,
    columnId: typeof value.columnId === "string" && value.columnId.trim().length > 0 ? value.columnId.trim() : undefined,
    assignee: typeof value.assignee === "string" && value.assignee.trim().length > 0 ? value.assignee.trim() : undefined,
    objective: typeof value.objective === "string" ? value.objective.trim() : undefined,
    acceptanceCriteria: normalizeOptionalStringArray(value.acceptanceCriteria),
    constraints: normalizeOptionalStringArray(value.constraints),
    contextFiles: normalizeOptionalStringArray(value.contextFiles),
    dependencies: Array.isArray(value.dependencies) ? value.dependencies.filter((item): item is string => typeof item === "string") : undefined,
    sourceIssueId: typeof value.sourceIssueId === "string" && value.sourceIssueId.trim().length > 0
      ? value.sourceIssueId.trim()
      : typeof value.source_issue_id === "string" && value.source_issue_id.trim().length > 0
        ? value.source_issue_id.trim()
        : undefined,
  };
}

export async function createAgentTasks(
  body: unknown,
  options: { vaultRoot?: string; now?: Date } = {},
): Promise<TaskCreateResponse> {
  if (!isPlainRecord(body) || !Array.isArray(body.tasks)) {
    throw createError({ statusCode: 422, statusMessage: "tasks array is required." });
  }

  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const workspaceId = normalizeConfiguredWorkspaceId(readConfiguredWorkspaceId(), readModel.workspaces);
  const filteredBoards = workspaceId === null
    ? readModel.boards
    : readModel.boards.filter((board) => board.workspaceId === workspaceId);

  const created: Array<{ id: string; title: string; warnings: ReadonlyArray<string> }> = [];
  const skipped: Array<{ title: string; reason: string }> = [];
  const errors: Array<{ title: string; error: string }> = [];

  for (const rawProposal of body.tasks) {
    let proposal: TaskProposal;
    try {
      proposal = parseProposal(rawProposal);
    } catch (error) {
      throw error;
    }

    const board = filteredBoards.find((entry) => entry.id === proposal.boardId);
    if (!board) {
      errors.push({ title: proposal.title, error: `Board ${proposal.boardId} was not found.` });
      continue;
    }

    const duplicate = readModel.tasks.find((task) =>
      task.boardId === proposal.boardId
      && task.status !== "done"
      && task.status !== "cancelled"
      && task.title.trim().toLowerCase() === proposal.title.trim().toLowerCase(),
    );
    if (duplicate) {
      skipped.push({ title: proposal.title, reason: `Duplicate open task: ${duplicate.id}` });
      continue;
    }

    const hasBoardColumns = readModel.columns.some((column) => column.boardId === board.id);
    if (!hasBoardColumns) {
      errors.push({ title: proposal.title, error: `Board ${board.id} has no columns.` });
      continue;
    }
    const COLUMN_SLUGS = ["todo", "in-progress", "review", "done"] as const;
    const columnId = proposal.columnId && COLUMN_SLUGS.includes(proposal.columnId as any)
      ? proposal.columnId
      : "todo";

    const issues = validateTaskInput({
      title: proposal.title,
      objective: proposal.objective,
      acceptanceCriteria: proposal.acceptanceCriteria,
      contextFiles: proposal.contextFiles,
    });
    if (issues.length > 0) {
      errors.push({ title: proposal.title, error: formatTaskInputIssues(issues) });
      continue;
    }

    try {
      const taskBody = usesRawStructuredBody(proposal.objective)
        ? proposal.objective?.trim()
        : buildBody(
          proposal.objective,
          proposal.acceptanceCriteria ? [...proposal.acceptanceCriteria] : undefined,
          proposal.constraints ? [...proposal.constraints] : undefined,
          proposal.contextFiles ? [...proposal.contextFiles] : undefined,
        ) || undefined;
      const task = await createVaultTask({
        title: proposal.title,
        projectId: board.projectId,
        boardId: board.id,
        column: columnId as any,
        priority: proposal.priority,
        assignee: proposal.assignee ?? "agent-claude-code",
        body: taskBody,
        dependsOn: proposal.dependencies,
        tags: proposal.objective ? ["planned"] : undefined,
        sourceIssueId: proposal.sourceIssueId,
        now: options.now,
        vaultRoot,
      });
      created.push({ id: task.frontmatter.id, title: task.frontmatter.title, warnings: buildProposalWarnings(proposal) });
    } catch (error) {
      if (error instanceof TaskCreateError) {
        errors.push({ title: proposal.title, error: error.message });
        continue;
      }
      throw error;
    }
  }

  return { created, skipped, errors };
}

export default defineEventHandler(async (event) => {
  const result = await createAgentTasks(await readBody(event));
  return result;
});
