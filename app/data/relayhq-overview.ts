import type {
  ReadModelAuditNote,
  ReadModelAgent,
  ReadModelBoard,
  ReadModelProject,
  ReadModelTask,
  VaultReadModel,
} from "../server/models/read-model";

export interface OverviewMetric {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}

export interface OverviewWorkflowStep {
  readonly title: string;
  readonly detail: string;
}

export interface OverviewLink {
  readonly label: string;
  readonly href: string;
  readonly note: string;
}

export interface WorkspaceOverviewRecord {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly sourcePath: string;
  readonly summary: string;
  readonly metrics: ReadonlyArray<OverviewMetric>;
  readonly projectId: string;
  readonly projectName: string;
  readonly boardId: string;
  readonly boardName: string;
  readonly taskId: string;
  readonly taskName: string;
  readonly links: ReadonlyArray<OverviewLink>;
}

export interface ProjectSummaryRecord {
  readonly id: string;
  readonly name: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly boardId: string;
  readonly boardName: string;
  readonly status: string;
  readonly sourcePath: string;
  readonly summary: string;
  readonly metrics: ReadonlyArray<OverviewMetric>;
  readonly workflow: ReadonlyArray<OverviewWorkflowStep>;
  readonly links: ReadonlyArray<OverviewLink>;
}

export interface BoardTaskRecord {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly assignee: string;
  readonly progress: number;
  readonly approval: string;
  readonly isStale: boolean;
  readonly note: string;
}

export interface BoardColumnRecord {
  readonly id: string;
  readonly title: string;
  readonly position: number;
  readonly summary: string;
  readonly taskCount: number;
  readonly tasks: ReadonlyArray<BoardTaskRecord>;
}

export interface BoardSummaryRecord {
  readonly id: string;
  readonly name: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly status: string;
  readonly sourcePath: string;
  readonly summary: string;
  readonly metrics: ReadonlyArray<OverviewMetric>;
  readonly workflow: ReadonlyArray<OverviewWorkflowStep>;
  readonly links: ReadonlyArray<OverviewLink>;
  readonly columns: ReadonlyArray<BoardColumnRecord>;
}

export interface AgentRegistryRecord {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly status: string;
  readonly provider: string;
  readonly model: string;
  readonly workspaceId: string;
  readonly capabilities: ReadonlyArray<string>;
  readonly taskTypesAccepted: ReadonlyArray<string>;
  readonly approvalRequiredFor: ReadonlyArray<string>;
  readonly cannotDo: ReadonlyArray<string>;
  readonly skillFile: string;
  readonly sourcePath: string;
  readonly availabilityLabel: string;
}

export interface PendingApprovalRecord {
  readonly id: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly assignee: string;
  readonly reason: string;
  readonly requestedAt: string;
  readonly requestedBy: string | null;
  readonly projectId: string;
  readonly boardId: string;
}

export interface AuditNoteRecord {
  readonly id: string;
  readonly taskId: string;
  readonly message: string;
  readonly source: string;
  readonly confidence: number;
  readonly createdAt: string;
}

export const relayhqReadModelKey = "relayhq-read-model" as const;
export const relayhqReadModelEndpoint = "/api/vault/read-model" as const;

export const emptyVaultReadModel: VaultReadModel = {
  workspaces: [],
  projects: [],
  boards: [],
  columns: [],
  tasks: [],
  issues: [],
  approvals: [],
  auditNotes: [],
  docs: [],
  agents: [],
};

function first<T>(items: ReadonlyArray<T>): T | null {
  return items[0] ?? null;
}

function findById<T extends { readonly id: string }>(items: ReadonlyArray<T>, id: string): T | null {
  return items.find((item) => item.id === id) ?? null;
}

function formatCount(value: number, label: string): string {
  return `${value} ${label}${value === 1 ? "" : "s"}`;
}

function buildFallbackLink(label: string, href: string, note: string): OverviewLink {
  return { label, href, note };
}

function buildAgentAvailabilityLabel(status: string): string {
  if (status === "available") {
    return "Available for assignment";
  }

  if (status === "busy") {
    return "Currently assigned";
  }

  if (status === "offline") {
    return "Unavailable right now";
  }

  return "Status defined in the vault";
}

function buildWorkspaceLinks(model: VaultReadModel): ReadonlyArray<OverviewLink> {
  const project = first(model.projects);
  const board = first(model.boards);
  const task = first(model.tasks);

  const links: Array<OverviewLink> = [
    buildFallbackLink("Project overview", `/projects/${project?.id ?? "project-unavailable"}`, project?.name ?? "Project unavailable"),
    buildFallbackLink("Board overview", `/boards/${board?.id ?? "board-unavailable"}`, board?.name ?? "Board unavailable"),
    buildFallbackLink("Task workflow", `/tasks/${task?.id ?? "task-unavailable"}`, task?.title ?? "Task unavailable"),
  ];

  return links;
}

function buildWorkspaceMetrics(model: VaultReadModel): ReadonlyArray<OverviewMetric> {
  const approvalCount = model.approvals.length;
  const pendingApprovalCount = model.approvals.filter((approval) => approval.outcome === "pending").length;

  return [
    { label: "Projects", value: String(model.projects.length), note: formatCount(model.projects.length, "project") },
    { label: "Boards", value: String(model.boards.length), note: formatCount(model.boards.length, "board") },
    { label: "Tasks", value: String(model.tasks.length), note: formatCount(model.tasks.length, "task") },
    { label: "Approvals", value: String(approvalCount), note: pendingApprovalCount > 0 ? `${pendingApprovalCount} pending` : "No pending approvals" },
  ];
}

function buildProjectWorkflow(project: ReadModelProject, boardCount: number, taskCount: number, approvalCount: number): ReadonlyArray<OverviewWorkflowStep> {
  return [
    { title: "Read vault state", detail: `Render the canonical project record from ${project.sourcePath}.` },
    { title: "Track board flow", detail: `${boardCount} board${boardCount === 1 ? "" : "s"} and ${taskCount} task${taskCount === 1 ? "" : "s"} stay visible in the control plane.` },
    { title: "Stop for approvals", detail: approvalCount > 0 ? `${approvalCount} approval${approvalCount === 1 ? "" : "s"} are linked to this project.` : "No approval gates are linked to this project yet." },
    { title: "Preserve history", detail: `Audit-ready source files remain in shared vault records for later review.` },
  ];
}

function buildBoardWorkflow(board: ReadModelBoard, columnCount: number, taskCount: number, approvalCount: number): ReadonlyArray<OverviewWorkflowStep> {
  return [
    { title: "Intake", detail: `Task records from ${board.sourcePath} stay ordered by the shared vault model.` },
    { title: "Coordinate", detail: `${columnCount} column${columnCount === 1 ? "" : "s"} and ${taskCount} task${taskCount === 1 ? "" : "s"} remain visible on the board.` },
    { title: "Approve", detail: approvalCount > 0 ? `${approvalCount} approval${approvalCount === 1 ? "" : "s"} are attached to this board.` : "No approval gates are attached to this board." },
    { title: "Audit", detail: "Board movement stays traceable through the vault-backed record." },
  ];
}

function buildProjectLinks(project: ReadModelProject, board: ReadModelBoard | null, task: ReadModelTask | null): ReadonlyArray<OverviewLink> {
  const links: Array<OverviewLink> = [buildFallbackLink("Vault project file", `/projects/${project.id}`, project.sourcePath)];

  if (board !== null) {
    links.push(buildFallbackLink("Open board view", `/boards/${board.id}`, board.sourcePath));
  }

  if (task !== null) {
    links.push(buildFallbackLink("Open task workflow", `/tasks/${task.id}`, task.sourcePath));
  }

  return links;
}

function buildBoardTask(task: ReadModelTask): BoardTaskRecord {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee,
    progress: task.progress,
    approval: task.approvalState.status,
    isStale: task.isStale,
    note: task.blockedReason ?? task.result ?? task.sourcePath,
  };
}

function buildAgentRegistryRecord(agent: ReadModelAgent): AgentRegistryRecord {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    status: agent.status,
    provider: agent.provider,
    model: agent.model,
    workspaceId: agent.workspaceId,
    capabilities: agent.capabilities,
    taskTypesAccepted: agent.taskTypesAccepted,
    approvalRequiredFor: agent.approvalRequiredFor,
    cannotDo: agent.cannotDo,
    skillFile: agent.skillFile,
    sourcePath: agent.sourcePath,
    availabilityLabel: buildAgentAvailabilityLabel(agent.status),
  };
}

function buildAuditNoteRecord(auditNote: ReadModelAuditNote): AuditNoteRecord {
  return {
    id: auditNote.id,
    taskId: auditNote.taskId,
    message: auditNote.message,
    source: auditNote.source,
    confidence: auditNote.confidence,
    createdAt: auditNote.createdAt,
  };
}

function buildColumnRecord(columnId: string, title: string, position: number, summary: string, tasks: ReadonlyArray<BoardTaskRecord>): BoardColumnRecord {
  return {
    id: columnId,
    title,
    position,
    summary,
    taskCount: tasks.length,
    tasks,
  };
}

export async function loadVaultReadModel(): Promise<VaultReadModel> {
  try {
    return await $fetch<VaultReadModel>(relayhqReadModelEndpoint);
  } catch {
    return emptyVaultReadModel;
  }
}

export function selectWorkspaceOverview(model: VaultReadModel): WorkspaceOverviewRecord {
  const workspace = first(model.workspaces) ?? { id: "", name: "Workspace unavailable", sourcePath: "vault/shared/workspaces/unavailable.md" };
  const project = first(model.projects);
  const board = first(model.boards);
  const task = first(model.tasks);

  return {
    id: workspace.id,
    name: workspace.name,
    status: model.workspaces.length === 0 ? "Awaiting vault data" : "Vault-backed control plane",
    sourcePath: workspace.sourcePath,
    summary:
      model.workspaces.length === 0
        ? "The workspace view will populate from the vault once shared records are available."
        : `The ${workspace.name} vault currently tracks ${model.projects.length} project${model.projects.length === 1 ? "" : "s"}, ${model.boards.length} board${model.boards.length === 1 ? "" : "s"}, and ${model.tasks.length} task${model.tasks.length === 1 ? "" : "s"}.`,
    metrics: buildWorkspaceMetrics(model),
    projectId: project?.id ?? "project-unavailable",
    projectName: project?.name ?? "Project unavailable",
    boardId: board?.id ?? "board-unavailable",
    boardName: board?.name ?? "Board unavailable",
    taskId: task?.id ?? "task-unavailable",
    taskName: task?.title ?? "Task unavailable",
    links: buildWorkspaceLinks(model),
  };
}

export function selectWorkspaceLinks(model: VaultReadModel): ReadonlyArray<OverviewLink> {
  return buildWorkspaceLinks(model);
}

export function selectAgentRegistry(model: VaultReadModel): ReadonlyArray<AgentRegistryRecord> {
  return model.agents.map(buildAgentRegistryRecord);
}

export function selectAuditNotes(model: VaultReadModel): ReadonlyArray<AuditNoteRecord> {
  return [...model.auditNotes]
    .map(buildAuditNoteRecord)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
}

export function selectPendingApprovals(model: VaultReadModel): ReadonlyArray<PendingApprovalRecord> {
  const linkedTaskIds = new Set(
    model.approvals.filter((approval) => approval.outcome === "pending").map((approval) => approval.taskId),
  );

  return [
    ...model.approvals
      .filter((approval) => approval.outcome === "pending")
      .map((approval) => {
        const task = findById(model.tasks, approval.taskId);

        return {
          id: approval.id,
          taskId: approval.taskId,
          taskTitle: task?.title ?? "Task unavailable",
          assignee: task?.assignee ?? "Unassigned",
          reason: approval.reason ?? task?.approvalReason ?? "No reason recorded",
          requestedAt: approval.requestedAt ?? "—",
          requestedBy: approval.requestedBy,
          projectId: approval.projectId,
          boardId: approval.boardId,
        };
      }),
    ...model.tasks
      .filter((task) => task.approvalState.status === "pending" && !linkedTaskIds.has(task.id))
      .map((task) => ({
        id: `task-${task.id}`,
        taskId: task.id,
        taskTitle: task.title,
        assignee: task.assignee,
        reason: task.approvalReason ?? "No reason recorded",
        requestedAt: task.approvalState.requestedAt ?? "—",
        requestedBy: task.approvalState.requestedBy,
        projectId: task.projectId,
        boardId: task.boardId,
      })),
  ]
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt) || left.taskTitle.localeCompare(right.taskTitle));
}

export function selectProjectSummary(model: VaultReadModel, projectId: string): ProjectSummaryRecord {
  const project = findById(model.projects, projectId);

  if (project === null) {
    return {
      id: projectId,
      name: "Project unavailable",
      workspaceId: "workspace-unavailable",
      workspaceName: "Workspace unavailable",
      boardId: "board-unavailable",
      boardName: "Board unavailable",
      status: "Awaiting vault data",
      sourcePath: `vault/shared/projects/${projectId}.md`,
      summary: "No live project record could be loaded from the vault yet.",
      metrics: [
        { label: "Boards", value: "0", note: "No live data" },
        { label: "Columns", value: "0", note: "No live data" },
        { label: "Tasks", value: "0", note: "No live data" },
        { label: "Approvals", value: "0", note: "No live data" },
      ],
      workflow: buildProjectWorkflow({ id: projectId, type: "project", workspaceId: "workspace-unavailable", name: "Project unavailable", codebases: [], boardIds: [], columnIds: [], taskIds: [], approvalIds: [], createdAt: "", updatedAt: "", body: "", sourcePath: `vault/shared/projects/${projectId}.md` }, 0, 0, 0),
      links: [buildFallbackLink("Project file", `/projects/${projectId}`, `vault/shared/projects/${projectId}.md`)],
    };
  }

  const workspace = findById(model.workspaces, project.workspaceId);
  const boardIds = project.boardIds.length > 0 ? project.boardIds : model.boards.filter((board) => board.projectId === project.id).map((board) => board.id);
  const board = findById(model.boards, boardIds[0] ?? "") ?? model.boards.find((candidate) => candidate.projectId === project.id) ?? null;
  const taskIds = project.taskIds.length > 0 ? project.taskIds : model.tasks.filter((task) => task.projectId === project.id).map((task) => task.id);
  const task = findById(model.tasks, taskIds[0] ?? "") ?? model.tasks.find((candidate) => candidate.projectId === project.id) ?? null;
  const approvalCount = project.approvalIds.length > 0 ? project.approvalIds.length : model.approvals.filter((approval) => approval.projectId === project.id).length;

  return {
    id: project.id,
    name: project.name,
    workspaceId: workspace?.id ?? project.workspaceId,
    workspaceName: workspace?.name ?? "Workspace unavailable",
    boardId: board?.id ?? "",
    boardName: board?.name ?? "Board unavailable",
    status: `${project.name} synced from the vault`,
    sourcePath: project.sourcePath,
    summary: `Vault-backed project record for ${project.name} with ${boardIds.length} board${boardIds.length === 1 ? "" : "s"}, ${taskIds.length} task${taskIds.length === 1 ? "" : "s"}, and ${approvalCount} approval${approvalCount === 1 ? "" : "s"}.`,
    metrics: [
      { label: "Boards", value: String(boardIds.length), note: formatCount(boardIds.length, "board") },
      { label: "Columns", value: String(project.columnIds.length), note: formatCount(project.columnIds.length, "column") },
      { label: "Tasks", value: String(taskIds.length), note: formatCount(taskIds.length, "task") },
      { label: "Approvals", value: String(approvalCount), note: approvalCount > 0 ? `${approvalCount} linked` : "No linked approvals" },
    ],
    workflow: buildProjectWorkflow(project, boardIds.length, taskIds.length, approvalCount),
    links: buildProjectLinks(project, board, task),
  };
}

export function selectBoardSummary(model: VaultReadModel, boardId: string): BoardSummaryRecord {
  const board = findById(model.boards, boardId);

  if (board === null) {
    return {
      id: boardId,
      name: "Board unavailable",
      projectId: "project-unavailable",
      projectName: "Project unavailable",
      workspaceId: "workspace-unavailable",
      workspaceName: "Workspace unavailable",
      status: "Awaiting vault data",
      sourcePath: `vault/shared/boards/${boardId}.md`,
      summary: "No live board record could be loaded from the vault yet.",
      metrics: [
        { label: "Open items", value: "0", note: "No live data" },
        { label: "In progress", value: "0", note: "No live data" },
        { label: "Waiting approval", value: "0", note: "No live data" },
        { label: "Done", value: "0", note: "No live data" },
      ],
      workflow: buildBoardWorkflow({ id: boardId, type: "board", workspaceId: "workspace-unavailable", projectId: "project-unavailable", name: "Board unavailable", columnIds: [], taskIds: [], approvalIds: [], createdAt: "", updatedAt: "", body: "", sourcePath: `vault/shared/boards/${boardId}.md` }, 0, 0, 0),
      links: [buildFallbackLink("Board file", `/boards/${boardId}`, `vault/shared/boards/${boardId}.md`)],
      columns: [],
    };
  }

  const project = findById(model.projects, board.projectId);
  const workspace = findById(model.workspaces, board.workspaceId);
  const columns = model.columns.filter((column) => column.boardId === board.id).sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  const tasks = model.tasks.filter((task) => task.boardId === board.id);
  const approvals = model.approvals.filter((approval) => approval.boardId === board.id);
  const tasksByColumnId = new Map<string, ReadonlyArray<BoardTaskRecord>>();

  for (const column of columns) {
    const columnTasks = tasks
      .filter((task) => task.columnId === column.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map(buildBoardTask);
    tasksByColumnId.set(column.id, columnTasks);
  }

  const columnRecords = columns.map((column) =>
    buildColumnRecord(
      column.id,
      column.name,
      column.position,
      `Column order ${column.position} in the board flow.`,
      tasksByColumnId.get(column.id) ?? [],
    ),
  );

  const statusCounts = tasks.reduce(
    (counts, task) => {
      counts[task.status] = (counts[task.status] ?? 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );

  return {
    id: board.id,
    name: board.name,
    projectId: project?.id ?? board.projectId,
    projectName: project?.name ?? "Project unavailable",
    workspaceId: workspace?.id ?? board.workspaceId,
    workspaceName: workspace?.name ?? "Workspace unavailable",
    status: `${board.name} synced from the vault`,
    sourcePath: board.sourcePath,
    summary: `Vault-backed board record with ${columnRecords.length} column${columnRecords.length === 1 ? "" : "s"}, ${tasks.length} task${tasks.length === 1 ? "" : "s"}, and ${approvals.length} approval${approvals.length === 1 ? "" : "s"}.`,
    metrics: [
      { label: "Open items", value: String(tasks.length), note: formatCount(tasks.length, "task") },
      { label: "In progress", value: String(statusCounts["in-progress"] ?? 0), note: "Tasks currently moving" },
      { label: "Waiting approval", value: String(statusCounts["waiting-approval"] ?? 0), note: "Human gates in view" },
      { label: "Done", value: String(statusCounts.done ?? 0), note: "Completed and retained" },
    ],
    workflow: buildBoardWorkflow(board, columnRecords.length, tasks.length, approvals.length),
    links: [
      ...(project === null ? [] : [buildFallbackLink("Project file", `/projects/${project.id}`, project.sourcePath)]),
      buildFallbackLink("Vault board file", `/boards/${board.id}`, board.sourcePath),
      ...(tasks[0] === undefined ? [] : [buildFallbackLink("Open task workflow", `/tasks/${tasks[0].id}`, tasks[0].title)]),
    ],
    columns: columnRecords,
  };
}

export function getProjectSummary(projectId: string, model: VaultReadModel = emptyVaultReadModel): ProjectSummaryRecord {
  return selectProjectSummary(model, projectId);
}

export function getBoardSummary(boardId: string, model: VaultReadModel = emptyVaultReadModel): BoardSummaryRecord {
  return selectBoardSummary(model, boardId);
}
