import type {
  ReadModelApproval,
  ReadModelBoard,
  ReadModelProject,
  ReadModelTask,
  VaultReadModel,
} from "../../models/read-model";

export type KiokuWorkStateEntityType = "project" | "board" | "task" | "approval" | "document";

export interface KiokuWorkStateRelation {
  readonly kind: KiokuWorkStateEntityType;
  readonly id: string;
}

export interface KiokuIndexDocument {
  readonly entityType: KiokuWorkStateEntityType;
  readonly entityId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly boardId: string | null;
  readonly taskId: string | null;
  readonly codebaseName?: string | null;
  readonly title: string;
  readonly summary: string;
  readonly keywords: ReadonlyArray<string>;
  readonly relations: ReadonlyArray<KiokuWorkStateRelation>;
  readonly updatedAt: string;
  readonly sourcePath: string;
  readonly canonical: true;
}

export interface KiokuWorkStateUpdate {
  readonly operation: "upsert";
  readonly document: KiokuIndexDocument;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function uniqueStrings(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function uniqueRelations(values: ReadonlyArray<KiokuWorkStateRelation>): ReadonlyArray<KiokuWorkStateRelation> {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = `${value.kind}:${value.id}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildDocument(input: {
  readonly entityType: KiokuWorkStateEntityType;
  readonly entityId: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly boardId: string | null;
  readonly taskId: string | null;
  readonly codebaseName?: string | null;
  readonly title: string;
  readonly summary: string;
  readonly keywords: ReadonlyArray<string>;
  readonly relations: ReadonlyArray<KiokuWorkStateRelation>;
  readonly updatedAt: string;
  readonly sourcePath: string;
}): KiokuIndexDocument {
  return {
    entityType: input.entityType,
    entityId: input.entityId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    boardId: input.boardId,
    taskId: input.taskId,
    ...(input.codebaseName === undefined ? {} : { codebaseName: input.codebaseName }),
    title: normalizeWhitespace(input.title),
    summary: normalizeWhitespace(input.summary),
    keywords: uniqueStrings(input.keywords),
    relations: uniqueRelations(input.relations),
    updatedAt: input.updatedAt,
    sourcePath: input.sourcePath,
    canonical: true,
  };
}

function buildProjectUpdate(project: ReadModelProject): KiokuWorkStateUpdate {
  return {
    operation: "upsert",
    document: buildDocument({
      entityType: "project",
      entityId: project.id,
      workspaceId: project.workspaceId,
      projectId: project.id,
      boardId: null,
      taskId: null,
      title: project.name,
      summary: `Project ${project.name} in workspace ${project.workspaceId}`,
      keywords: [project.id, project.workspaceId, project.name],
      relations: [{ kind: "project", id: project.id }],
      updatedAt: project.updatedAt,
      sourcePath: project.sourcePath,
    }),
  };
}

function buildBoardUpdate(board: ReadModelBoard): KiokuWorkStateUpdate {
  return {
    operation: "upsert",
    document: buildDocument({
      entityType: "board",
      entityId: board.id,
      workspaceId: board.workspaceId,
      projectId: board.projectId,
      boardId: board.id,
      taskId: null,
      title: board.name,
      summary: `Board ${board.name} for project ${board.projectId}`,
      keywords: [board.id, board.projectId, board.workspaceId, board.name],
      relations: [
        { kind: "project", id: board.projectId },
        { kind: "board", id: board.id },
      ],
      updatedAt: board.updatedAt,
      sourcePath: board.sourcePath,
    }),
  };
}

function buildTaskSummary(task: ReadModelTask): string {
  const approvalFlag = task.approvalNeeded ? "approval required" : "approval not required";
  return `Task ${task.title} on ${task.columnId} is ${task.status} at ${task.progress}% (${approvalFlag})`;
}

function buildTaskUpdate(task: ReadModelTask): KiokuWorkStateUpdate {
  return {
    operation: "upsert",
    document: buildDocument({
      entityType: "task",
      entityId: task.id,
      workspaceId: task.workspaceId,
      projectId: task.projectId,
      boardId: task.boardId,
      taskId: task.id,
      title: task.title,
      summary: buildTaskSummary(task),
      keywords: [
        task.id,
        task.projectId,
        task.boardId,
        task.columnId,
        task.status,
        task.priority,
        task.assignee,
        ...task.tags,
      ],
      relations: [
        { kind: "project", id: task.projectId },
        { kind: "board", id: task.boardId },
        { kind: "task", id: task.id },
        ...task.dependsOn.map((id) => ({ kind: "task" as const, id })),
      ],
      updatedAt: task.updatedAt,
      sourcePath: task.sourcePath,
    }),
  };
}

function buildApprovalSummary(approval: ReadModelApproval): string {
  return `Approval ${approval.outcome} for task ${approval.taskId} is ${approval.status}`;
}

function buildApprovalUpdate(approval: ReadModelApproval): KiokuWorkStateUpdate {
  return {
    operation: "upsert",
    document: buildDocument({
      entityType: "approval",
      entityId: approval.id,
      workspaceId: approval.workspaceId,
      projectId: approval.projectId,
      boardId: approval.boardId,
      taskId: approval.taskId,
      title: `Approval for ${approval.taskId}`,
      summary: buildApprovalSummary(approval),
      keywords: [approval.id, approval.projectId, approval.boardId, approval.taskId, approval.outcome, approval.status],
      relations: [
        { kind: "project", id: approval.projectId },
        { kind: "board", id: approval.boardId },
        { kind: "task", id: approval.taskId },
        { kind: "approval", id: approval.id },
      ],
      updatedAt: approval.updatedAt,
      sourcePath: approval.sourcePath,
    }),
  };
}

export function buildDocumentUpdate(input: {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly sourcePath: string;
  readonly tags: ReadonlyArray<string>;
  readonly updatedAt: string;
}): KiokuWorkStateUpdate {
  return {
    operation: "upsert",
    document: buildDocument({
      entityType: "document",
      entityId: input.id,
      workspaceId: "",
      projectId: null,
      boardId: null,
      taskId: null,
      title: input.title,
      summary: input.content,
      keywords: [input.id, ...input.tags],
      relations: [],
      updatedAt: input.updatedAt,
      sourcePath: input.sourcePath,
    }),
  };
}

export function buildCodeDocumentUpdate(input: {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly sourcePath: string;
  readonly tags: ReadonlyArray<string>;
  readonly updatedAt: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly codebaseName?: string;
}): KiokuWorkStateUpdate {
  return {
    operation: "upsert",
    document: buildDocument({
      entityType: "document",
      entityId: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      boardId: null,
      taskId: null,
      ...(input.codebaseName === undefined ? {} : { codebaseName: input.codebaseName }),
      title: input.title,
      summary: input.content,
      keywords: [input.id, input.projectId, input.workspaceId, ...input.tags],
      relations: [{ kind: "project", id: input.projectId }],
      updatedAt: input.updatedAt,
      sourcePath: input.sourcePath,
    }),
  };
}

export function buildKiokuIndexUpdates(readModel: VaultReadModel): ReadonlyArray<KiokuWorkStateUpdate> {
  return [
    ...readModel.projects.map(buildProjectUpdate),
    ...readModel.boards.map(buildBoardUpdate),
    ...readModel.tasks.map(buildTaskUpdate),
    ...readModel.approvals.map(buildApprovalUpdate),
  ];
}
