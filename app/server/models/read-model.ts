import type {
  AgentFrontmatter,
  ApprovalOutcome,
  ApprovalFrontmatter,
  AuditNoteFrontmatter,
  BoardFrontmatter,
  ColumnFrontmatter,
  DocFrontmatter,
  IssueFrontmatter,
  ProjectFrontmatter,
  TaskFrontmatter,
  VaultDocument,
  VaultReadCollections,
  WorkspaceFrontmatter,
} from "../services/vault/repository";

export type {
  AgentFrontmatter,
  ApprovalFrontmatter,
  AuditNoteFrontmatter,
  BoardFrontmatter,
  ColumnFrontmatter,
  DocFrontmatter,
  IssueFrontmatter,
  ProjectFrontmatter,
  TaskFrontmatter,
  VaultDocument,
  VaultReadCollections,
  WorkspaceFrontmatter,
} from "../services/vault/repository";
import { isTaskHeartbeatStale } from "../services/vault/lock";

export interface ReadModelAgent {
  readonly id: string;
  readonly type: "agent";
  readonly workspaceId: string;
  readonly name: string;
  readonly role: string;
  readonly provider: string;
  readonly model: string;
  readonly capabilities: ReadonlyArray<string>;
  readonly taskTypesAccepted: ReadonlyArray<string>;
  readonly approvalRequiredFor: ReadonlyArray<string>;
  readonly cannotDo: ReadonlyArray<string>;
  readonly accessibleBy: ReadonlyArray<string>;
  readonly skillFile: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly body: string;
  readonly sourcePath: string;
}

export interface ReadModelLink {
  readonly projectId: string;
  readonly threadId: string;
}

export interface ReadModelApprovalState {
  readonly status: "not-needed" | "pending" | "approved" | "rejected";
  readonly needed: boolean;
  readonly outcome: ApprovalOutcome;
  readonly requestedBy: string | null;
  readonly requestedAt: string | null;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly reason: string | null;
}

export interface ReadModelWorkspace {
  readonly id: string;
  readonly type: "workspace";
  readonly name: string;
  readonly ownerIds: ReadonlyArray<string>;
  readonly memberIds: ReadonlyArray<string>;
  readonly projectIds: ReadonlyArray<string>;
  readonly boardIds: ReadonlyArray<string>;
  readonly columnIds: ReadonlyArray<string>;
  readonly taskIds: ReadonlyArray<string>;
  readonly approvalIds: ReadonlyArray<string>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly body: string;
  readonly sourcePath: string;
}

export interface ReadModelProject {
  readonly id: string;
  readonly type: "project";
  readonly workspaceId: string;
  readonly name: string;
  readonly codebases: ReadonlyArray<{ readonly name: string; readonly path: string; readonly tech?: string; readonly primary?: boolean }>;
  readonly boardIds: ReadonlyArray<string>;
  readonly columnIds: ReadonlyArray<string>;
  readonly taskIds: ReadonlyArray<string>;
  readonly approvalIds: ReadonlyArray<string>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly body: string;
  readonly sourcePath: string;
}

export interface ReadModelBoard {
  readonly id: string;
  readonly type: "board";
  readonly workspaceId: string;
  readonly projectId: string;
  readonly name: string;
  readonly columnIds: ReadonlyArray<string>;
  readonly taskIds: ReadonlyArray<string>;
  readonly approvalIds: ReadonlyArray<string>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly body: string;
  readonly sourcePath: string;
}

export interface ReadModelColumn {
  readonly id: string;
  readonly type: "column";
  readonly workspaceId: string;
  readonly projectId: string;
  readonly boardId: string;
  readonly name: string;
  readonly position: number;
  readonly taskIds: ReadonlyArray<string>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly body: string;
  readonly sourcePath: string;
}

export interface ReadModelTask {
  readonly id: string;
  readonly type: "task";
  readonly workspaceId: string;
  readonly projectId: string;
  readonly boardId: string;
  readonly columnId: string;
  readonly status: TaskFrontmatter["status"];
  readonly priority: TaskFrontmatter["priority"];
  readonly title: string;
  readonly assignee: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly heartbeatAt: string | null;
  readonly executionStartedAt: string | null;
  readonly executionNotes: string | null;
  readonly progress: number;
  readonly approvalNeeded: boolean;
  readonly approvalRequestedBy: string | null;
  readonly approvalReason: string | null;
  readonly approvedBy: string | null;
  readonly approvedAt: string | null;
  readonly approvalOutcome: ApprovalOutcome;
  readonly blockedReason: string | null;
  readonly blockedSince: string | null;
  readonly result: string | null;
  readonly completedAt: string | null;
  readonly parentTaskId: string | null;
  readonly sourceIssueId?: string | null;
  readonly dependsOn: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly links: ReadonlyArray<ReadModelLink>;
  readonly lockedBy: string | null;
  readonly lockedAt: string | null;
  readonly lockExpiresAt: string | null;
  readonly isStale: boolean;
  readonly approvalIds: ReadonlyArray<string>;
  readonly approvalState: ReadModelApprovalState;
  readonly body: string;
  readonly sourcePath: string;
}

export interface ReadModelApproval {
  readonly id: string;
  readonly type: "approval";
  readonly workspaceId: string;
  readonly projectId: string;
  readonly boardId: string;
  readonly taskId: string;
  readonly status: string;
  readonly outcome: ApprovalOutcome;
  readonly requestedBy: string | null;
  readonly requestedAt: string | null;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly reason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly body: string;
  readonly sourcePath: string;
}

export interface ReadModelAuditNote {
  readonly id: string;
  readonly type: "audit-note";
  readonly taskId: string;
  readonly message: string;
  readonly source: string;
  readonly confidence: number;
  readonly createdAt: string;
  readonly sourcePath: string;
}

export interface ReadModelDoc {
  readonly id: string;
  readonly type: "doc";
  readonly docType: string;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tags: ReadonlyArray<string>;
  readonly body: string;
  readonly sourcePath: string;
}

export interface ReadModelIssue {
  readonly id: string;
  readonly type: "issue";
  readonly workspaceId: string;
  readonly projectId: string;
  readonly status: IssueFrontmatter["status"];
  readonly priority: IssueFrontmatter["priority"];
  readonly title: string;
  readonly reportedBy: string;
  readonly discoveredDuringTaskId: string | null;
  readonly linkedTaskIds: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly body: string;
  readonly sourcePath: string;
}

export interface VaultReadModel {
  readonly workspaces: ReadonlyArray<ReadModelWorkspace>;
  readonly projects: ReadonlyArray<ReadModelProject>;
  readonly boards: ReadonlyArray<ReadModelBoard>;
  readonly columns: ReadonlyArray<ReadModelColumn>;
  readonly tasks: ReadonlyArray<ReadModelTask>;
  readonly issues: ReadonlyArray<ReadModelIssue>;
  readonly approvals: ReadonlyArray<ReadModelApproval>;
  readonly auditNotes: ReadonlyArray<ReadModelAuditNote>;
  readonly docs: ReadonlyArray<ReadModelDoc>;
  readonly agents: ReadonlyArray<ReadModelAgent>;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

function sortById<T extends { readonly id: string; readonly sourcePath: string }>(items: ReadonlyArray<T>): ReadonlyArray<T> {
  return [...items].sort((left, right) => {
    const idComparison = compareText(left.id, right.id);
    if (idComparison !== 0) {
      return idComparison;
    }

    return compareText(left.sourcePath, right.sourcePath);
  });
}

function sortColumns(items: ReadonlyArray<ReadModelColumn>): ReadonlyArray<ReadModelColumn> {
  return [...items].sort((left, right) => {
    const workspaceComparison = compareText(left.workspaceId, right.workspaceId);
    if (workspaceComparison !== 0) {
      return workspaceComparison;
    }

    const projectComparison = compareText(left.projectId, right.projectId);
    if (projectComparison !== 0) {
      return projectComparison;
    }

    const boardComparison = compareText(left.boardId, right.boardId);
    if (boardComparison !== 0) {
      return boardComparison;
    }

    const positionComparison = left.position - right.position;
    if (positionComparison !== 0) {
      return positionComparison;
    }

    const idComparison = compareText(left.id, right.id);
    if (idComparison !== 0) {
      return idComparison;
    }

    return compareText(left.sourcePath, right.sourcePath);
  });
}

function sortStrings(items: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...items].sort(compareText);
}

function groupBy<T, K extends string>(items: ReadonlyArray<T>, keySelector: (item: T) => K): Map<K, ReadonlyArray<T>> {
  const groups = new Map<K, T[]>();

  for (const item of items) {
    const key = keySelector(item);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [item]);
      continue;
    }

    existing.push(item);
  }

  return new Map([...groups.entries()].map(([key, values]) => [key, values] as const));
}

function readLinkArray(record: TaskFrontmatter): ReadonlyArray<ReadModelLink> {
  return [...record.links]
    .map((link) => ({ projectId: link.project, threadId: link.thread }))
    .sort((left, right) => {
      const projectComparison = compareText(left.projectId, right.projectId);
      if (projectComparison !== 0) {
        return projectComparison;
      }

      return compareText(left.threadId, right.threadId);
    });
}

function normalizeCodebases(frontmatter: ProjectFrontmatter): ReadonlyArray<ReadModelProject["codebases"][number]> {
  if (Array.isArray(frontmatter.codebases) && frontmatter.codebases.length > 0) {
    return [...frontmatter.codebases].sort((left, right) => left.name.localeCompare(right.name));
  }

  if (typeof frontmatter.codebase_root === "string" && frontmatter.codebase_root.trim().length > 0) {
    return [{ name: "main", path: frontmatter.codebase_root.trim(), primary: true }];
  }

  return [];
}

function getLatestApproval(approvals: ReadonlyArray<ReadModelApproval>): ReadModelApproval | null {
  if (approvals.length === 0) {
    return null;
  }

  return [...approvals].sort((left, right) => {
    const updatedComparison = compareText(right.updatedAt, left.updatedAt);
    if (updatedComparison !== 0) {
      return updatedComparison;
    }

    const createdComparison = compareText(right.createdAt, left.createdAt);
    if (createdComparison !== 0) {
      return createdComparison;
    }

    const idComparison = compareText(right.id, left.id);
    if (idComparison !== 0) {
      return idComparison;
    }

    return compareText(right.sourcePath, left.sourcePath);
  })[0] ?? null;
}

function toApprovalState(task: TaskFrontmatter, approval: ReadModelApproval | null): ReadModelApprovalState {
  const outcome = task.approval_outcome;

  return {
    status: outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : task.approval_needed ? "pending" : "not-needed",
    needed: task.approval_needed,
    outcome,
    requestedBy: approval?.requestedBy ?? task.approval_requested_by,
    requestedAt: approval?.requestedAt ?? null,
    decidedBy: approval?.decidedBy ?? task.approved_by,
    decidedAt: approval?.decidedAt ?? task.approved_at,
    reason: approval?.reason ?? task.approval_reason,
  };
}

function buildWorkspaceModel(
  document: VaultDocument<WorkspaceFrontmatter>,
  projectIds: ReadonlyArray<string>,
  boardIds: ReadonlyArray<string>,
  columnIds: ReadonlyArray<string>,
  taskIds: ReadonlyArray<string>,
  approvalIds: ReadonlyArray<string>,
): ReadModelWorkspace {
  return {
    id: document.frontmatter.id,
    type: "workspace",
    name: document.frontmatter.name,
    ownerIds: sortStrings(document.frontmatter.owner_ids),
    memberIds: sortStrings(document.frontmatter.member_ids),
    projectIds,
    boardIds,
    columnIds,
    taskIds,
    approvalIds,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath,
  };
}

function buildProjectModel(
  document: VaultDocument<ProjectFrontmatter>,
  boardIds: ReadonlyArray<string>,
  columnIds: ReadonlyArray<string>,
  taskIds: ReadonlyArray<string>,
  approvalIds: ReadonlyArray<string>,
): ReadModelProject {
  return {
    id: document.frontmatter.id,
    type: "project",
    workspaceId: document.frontmatter.workspace_id,
    name: document.frontmatter.name,
    codebases: normalizeCodebases(document.frontmatter),
    boardIds,
    columnIds,
    taskIds,
    approvalIds,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath,
  };
}

function buildBoardModel(
  document: VaultDocument<BoardFrontmatter>,
  columnIds: ReadonlyArray<string>,
  taskIds: ReadonlyArray<string>,
  approvalIds: ReadonlyArray<string>,
): ReadModelBoard {
  return {
    id: document.frontmatter.id,
    type: "board",
    workspaceId: document.frontmatter.workspace_id,
    projectId: document.frontmatter.project_id,
    name: document.frontmatter.name,
    columnIds,
    taskIds,
    approvalIds,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath,
  };
}

function buildColumnModel(document: VaultDocument<ColumnFrontmatter>, taskIds: ReadonlyArray<string>): ReadModelColumn {
  return {
    id: document.frontmatter.id,
    type: "column",
    workspaceId: document.frontmatter.workspace_id,
    projectId: document.frontmatter.project_id,
    boardId: document.frontmatter.board_id,
    name: document.frontmatter.name,
    position: document.frontmatter.position,
    taskIds,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath,
  };
}

function buildApprovalModel(document: VaultDocument<ApprovalFrontmatter>): ReadModelApproval {
  return {
    id: document.frontmatter.id,
    type: "approval",
    workspaceId: document.frontmatter.workspace_id,
    projectId: document.frontmatter.project_id,
    boardId: document.frontmatter.board_id,
    taskId: document.frontmatter.task_id,
    status: document.frontmatter.status,
    outcome: document.frontmatter.outcome,
    requestedBy: document.frontmatter.requested_by,
    requestedAt: document.frontmatter.requested_at,
    decidedBy: document.frontmatter.decided_by,
    decidedAt: document.frontmatter.decided_at,
    reason: document.frontmatter.reason,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath,
  };
}

function buildAuditNoteModel(document: VaultDocument<AuditNoteFrontmatter>): ReadModelAuditNote {
  return {
    id: document.frontmatter.id,
    type: "audit-note",
    taskId: document.frontmatter.task_id,
    message: document.frontmatter.message,
    source: document.frontmatter.source,
    confidence: document.frontmatter.confidence,
    createdAt: document.frontmatter.created_at,
    sourcePath: document.sourcePath,
  };
}

function buildIssueModel(document: VaultDocument<IssueFrontmatter>): ReadModelIssue {
  return {
    id: document.frontmatter.id,
    type: "issue",
    workspaceId: document.frontmatter.workspace_id,
    projectId: document.frontmatter.project_id,
    status: document.frontmatter.status,
    priority: document.frontmatter.priority,
    title: document.frontmatter.title,
    reportedBy: document.frontmatter.reported_by,
    discoveredDuringTaskId: document.frontmatter.discovered_during_task_id,
    linkedTaskIds: sortStrings(document.frontmatter.linked_task_ids),
    tags: sortStrings(document.frontmatter.tags),
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath,
  };
}

function buildAgentModel(document: VaultDocument<AgentFrontmatter>): ReadModelAgent {
  return {
    id: document.frontmatter.id,
    type: "agent",
    workspaceId: document.frontmatter.workspace_id,
    name: document.frontmatter.name,
    role: document.frontmatter.role,
    provider: document.frontmatter.provider,
    model: document.frontmatter.model,
    capabilities: sortStrings(document.frontmatter.capabilities),
    taskTypesAccepted: sortStrings(document.frontmatter.task_types_accepted),
    approvalRequiredFor: sortStrings(document.frontmatter.approval_required_for),
    cannotDo: sortStrings(document.frontmatter.cannot_do),
    accessibleBy: sortStrings(document.frontmatter.accessible_by),
    skillFile: document.frontmatter.skill_file,
    status: document.frontmatter.status,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    body: document.body,
    sourcePath: document.sourcePath,
  };
}

function buildTaskModel(document: VaultDocument<TaskFrontmatter>, approvals: ReadonlyArray<ReadModelApproval>, now: Date): ReadModelTask {
  const latestApproval = getLatestApproval(approvals);
  const isStale = isTaskHeartbeatStale(document.frontmatter, now);

  return {
    id: document.frontmatter.id,
    type: "task",
    workspaceId: document.frontmatter.workspace_id,
    projectId: document.frontmatter.project_id,
    boardId: document.frontmatter.board_id,
    columnId: document.frontmatter.column,
    status: document.frontmatter.status,
    priority: document.frontmatter.priority,
    title: document.frontmatter.title,
    assignee: document.frontmatter.assignee,
    createdBy: document.frontmatter.created_by,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    heartbeatAt: document.frontmatter.heartbeat_at,
    executionStartedAt: document.frontmatter.execution_started_at,
    executionNotes: document.frontmatter.execution_notes,
    progress: document.frontmatter.progress,
    approvalNeeded: document.frontmatter.approval_needed,
    approvalRequestedBy: document.frontmatter.approval_requested_by,
    approvalReason: document.frontmatter.approval_reason,
    approvedBy: document.frontmatter.approved_by,
    approvedAt: document.frontmatter.approved_at,
    approvalOutcome: document.frontmatter.approval_outcome,
    blockedReason: document.frontmatter.blocked_reason,
    blockedSince: document.frontmatter.blocked_since,
    result: document.frontmatter.result,
    completedAt: document.frontmatter.completed_at,
    parentTaskId: document.frontmatter.parent_task_id,
    sourceIssueId: document.frontmatter.source_issue_id ?? null,
    dependsOn: sortStrings(document.frontmatter.depends_on),
    tags: sortStrings(document.frontmatter.tags),
    links: readLinkArray(document.frontmatter),
    lockedBy: document.frontmatter.locked_by,
    lockedAt: document.frontmatter.locked_at,
    lockExpiresAt: document.frontmatter.lock_expires_at,
    isStale,
    approvalIds: sortStrings(approvals.map((approval) => approval.id)),
    approvalState: toApprovalState(document.frontmatter, latestApproval),
    body: document.body,
    sourcePath: document.sourcePath,
  };
}

function collectIds<T extends { readonly id: string }>(items: ReadonlyArray<T>): ReadonlyArray<string> {
  return sortStrings(items.map((item) => item.id));
}

function collectGroupedIds<T extends { readonly id: string }>(groups: Map<string, ReadonlyArray<T>>, key: string): ReadonlyArray<string> {
  return collectIds(groups.get(key) ?? []);
}

function collectColumnIdsByPosition(items: ReadonlyArray<ReadModelColumn>): ReadonlyArray<string> {
  return [...items]
    .sort((left, right) => {
      const positionComparison = left.position - right.position;
      if (positionComparison !== 0) {
        return positionComparison;
      }

      const idComparison = compareText(left.id, right.id);
      if (idComparison !== 0) {
        return idComparison;
      }

      return compareText(left.sourcePath, right.sourcePath);
    })
    .map((item) => item.id);
}

function buildDocModel(document: VaultDocument<DocFrontmatter>): ReadModelDoc {
  return {
    id: document.frontmatter.id,
    type: "doc",
    docType: document.frontmatter.doc_type,
    workspaceId: document.frontmatter.workspace_id,
    projectId: document.frontmatter.project_id,
    title: document.frontmatter.title,
    status: document.frontmatter.status,
    createdAt: document.frontmatter.created_at,
    updatedAt: document.frontmatter.updated_at,
    tags: [...document.frontmatter.tags].sort(),
    body: document.body,
    sourcePath: document.sourcePath,
  };
}

export function filterVaultReadModelByWorkspaceId(readModel: VaultReadModel, workspaceId: string): VaultReadModel {
  return {
    workspaces: readModel.workspaces.filter((ws) => ws.id === workspaceId),
    projects: readModel.projects.filter((p) => p.workspaceId === workspaceId),
    boards: readModel.boards.filter((b) => b.workspaceId === workspaceId),
    columns: readModel.columns.filter((c) => c.workspaceId === workspaceId),
    tasks: readModel.tasks.filter((t) => t.workspaceId === workspaceId),
    issues: readModel.issues.filter((issue) => issue.workspaceId === workspaceId),
    approvals: readModel.approvals.filter((a) => a.workspaceId === workspaceId),
    auditNotes: readModel.auditNotes.filter((n) => {
      const task = readModel.tasks.find((t) => t.id === n.taskId);
      return task?.workspaceId === workspaceId;
    }),
    docs: readModel.docs.filter((d) => d.workspaceId === workspaceId),
    agents: readModel.agents.filter((a) => a.workspaceId === workspaceId),
  };
}

export function buildVaultReadModel(collections: VaultReadCollections, now: Date = new Date()): VaultReadModel {
  const agents = sortById(collections.agents.map(buildAgentModel));
  const approvals = sortById(collections.approvals.map(buildApprovalModel));
  const auditNotes = sortById(collections.auditNotes.map(buildAuditNoteModel));
  const issues = sortById(collections.issues.map(buildIssueModel));
  const approvalsByTaskId = groupBy(approvals, (approval) => approval.taskId);
  const approvalsByBoardId = groupBy(approvals, (approval) => approval.boardId);
  const approvalsByProjectId = groupBy(approvals, (approval) => approval.projectId);
  const approvalsByWorkspaceId = groupBy(approvals, (approval) => approval.workspaceId);
  const tasks = sortById(
    collections.tasks.map((task) => buildTaskModel(task, approvalsByTaskId.get(task.frontmatter.id) ?? [], now)),
  );
  const tasksByWorkspaceId = groupBy(tasks, (task) => task.workspaceId);
  const tasksByProjectId = groupBy(tasks, (task) => task.projectId);
  const tasksByBoardId = groupBy(tasks, (task) => task.boardId);
  const tasksByColumnId = groupBy(tasks, (task) => task.columnId);

  const columns = sortColumns(
    collections.columns.map((column) =>
      buildColumnModel(column, collectIds(tasksByColumnId.get(column.frontmatter.id) ?? [])),
    ),
  );
  const columnsByWorkspaceId = groupBy(columns, (column) => column.workspaceId);
  const columnsByProjectId = groupBy(columns, (column) => column.projectId);

  const boards = sortById(
    collections.boards.map((board) =>
      buildBoardModel(
        board,
        collectColumnIdsByPosition(columns.filter((column) => column.boardId === board.frontmatter.id)),
        collectIds(tasksByBoardId.get(board.frontmatter.id) ?? []),
        collectGroupedIds(approvalsByBoardId, board.frontmatter.id),
      ),
    ),
  );
  const boardsByWorkspaceId = groupBy(boards, (board) => board.workspaceId);
  const boardsByProjectId = groupBy(boards, (board) => board.projectId);

  const projects = sortById(
    collections.projects.map((project) =>
      buildProjectModel(
        project,
        collectIds(boardsByProjectId.get(project.frontmatter.id) ?? []),
        collectIds(columnsByProjectId.get(project.frontmatter.id) ?? []),
        collectIds(tasksByProjectId.get(project.frontmatter.id) ?? []),
        collectGroupedIds(approvalsByProjectId, project.frontmatter.id),
      ),
    ),
  );
  const projectsByWorkspaceId = groupBy(projects, (project) => project.workspaceId);

  const workspaces = sortById(
    collections.workspaces.map((workspace) =>
      buildWorkspaceModel(
        workspace,
        collectIds(projectsByWorkspaceId.get(workspace.frontmatter.id) ?? []),
        collectIds(boardsByWorkspaceId.get(workspace.frontmatter.id) ?? []),
        collectIds(columnsByWorkspaceId.get(workspace.frontmatter.id) ?? []),
        collectIds(tasksByWorkspaceId.get(workspace.frontmatter.id) ?? []),
        collectGroupedIds(approvalsByWorkspaceId, workspace.frontmatter.id),
      ),
    ),
  );

  const docs = sortById(collections.docs.map(buildDocModel));

  return {
    workspaces,
    projects,
    boards,
    columns,
    tasks,
    issues,
    approvals,
    auditNotes,
    docs,
    agents,
  };
}
