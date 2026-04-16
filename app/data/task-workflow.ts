import type { ReadModelApproval, ReadModelAuditNote, ReadModelTask, TaskFrontmatter, VaultReadModel } from "../server/models/read-model";
import { emptyVaultReadModel, relayhqReadModelEndpoint, selectWorkspaceLinks } from "./relayhq-overview";

export type TaskApprovalStatus = "not-needed" | "pending" | "approved" | "rejected";
export type TaskTimelineState = "complete" | "current" | "blocked";

export interface TaskWorkflowApprovalState {
  readonly status: TaskApprovalStatus;
  readonly needed: boolean;
  readonly outcome: "approved" | "rejected" | "pending";
  readonly requestedBy: string | null;
  readonly requestedAt: string | null;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly reason: string | null;
}

export interface TaskWorkflowApprovalRecord {
  readonly id: string;
  readonly status: string;
  readonly outcome: "approved" | "rejected" | "pending";
  readonly requestedBy: string | null;
  readonly requestedAt: string | null;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly reason: string | null;
}

export interface TaskTimelineStep {
  readonly title: string;
  readonly detail: string;
  readonly timestamp: string;
  readonly state: TaskTimelineState;
}

export interface TaskWorkflowAuditNote {
  readonly id: string;
  readonly message: string;
  readonly source: string;
  readonly confidence: number;
  readonly createdAt: string;
}

export interface TaskWorkflowRecord {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly sourcePath: string;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly boardId: string;
  readonly boardName: string;
  readonly column: TaskFrontmatter["column"] | "unavailable";
  readonly status: TaskFrontmatter["status"] | "unavailable";
  readonly isStale: boolean;
  readonly priority: TaskFrontmatter["priority"] | "unavailable";
  readonly assignee: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly progress: number;
  readonly approvalNeeded: boolean;
  readonly approvalState: TaskWorkflowApprovalState;
  readonly blockedReason: string | null;
  readonly blockedSince: string | null;
  readonly result: string | null;
  readonly completedAt: string | null;
  readonly parentTaskId: string | null;
  readonly dependsOn: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly links: ReadonlyArray<{ readonly projectId: string; readonly threadId: string }>;
  readonly metrics: ReadonlyArray<{ readonly label: string; readonly value: string; readonly note: string }>;
  readonly timeline: ReadonlyArray<TaskTimelineStep>;
  readonly approvals: ReadonlyArray<TaskWorkflowApprovalRecord>;
  readonly auditNotes: ReadonlyArray<TaskWorkflowAuditNote>;
  readonly lockedBy?: string | null;
  readonly lockedAt?: string | null;
  readonly lockExpiresAt?: string | null;
}

export const defaultTaskWorkflowId = "task-002" as const;

const taskColumns = ["todo", "in-progress", "review", "done"] as const satisfies ReadonlyArray<TaskFrontmatter["column"]>;

function first<T>(items: ReadonlyArray<T>): T | null {
  return items[0] ?? null;
}

function isTaskColumn(value: string): value is TaskFrontmatter["column"] {
  return taskColumns.includes(value as TaskFrontmatter["column"]);
}

function normalizeTaskColumn(column: string): TaskFrontmatter["column"] | "unavailable" {
  return isTaskColumn(column) ? column : "unavailable";
}

function findById<T extends { readonly id: string }>(items: ReadonlyArray<T>, id: string): T | null {
  return items.find((item) => item.id === id) ?? null;
}

function compareDescending(left: string | null, right: string | null): number {
  return (right ?? "").localeCompare(left ?? "");
}

function formatTimestamp(value: string | null): string {
  if (value === null) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function buildApprovalRecords(approvals: ReadonlyArray<ReadModelApproval>): ReadonlyArray<TaskWorkflowApprovalRecord> {
  return [...approvals]
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt) || compareDescending(left.createdAt, right.createdAt) || right.id.localeCompare(left.id))
    .map((approval) => ({
      id: approval.id,
      status: approval.status,
      outcome: approval.outcome,
      requestedBy: approval.requestedBy,
      requestedAt: approval.requestedAt,
      decidedBy: approval.decidedBy,
      decidedAt: approval.decidedAt,
      reason: approval.reason,
    }));
}

function selectLatestApproval(approvals: ReadonlyArray<TaskWorkflowApprovalRecord>): TaskWorkflowApprovalRecord | null {
  return approvals[0] ?? null;
}

function buildApprovalState(task: ReadModelTask, approval: TaskWorkflowApprovalRecord | null): TaskWorkflowApprovalState {
  const outcome = task.approvalOutcome;

  return {
    status: outcome === "approved" ? "approved" : outcome === "rejected" ? "rejected" : task.approvalNeeded ? "pending" : "not-needed",
    needed: task.approvalNeeded,
    outcome,
    requestedBy: approval?.requestedBy ?? task.approvalRequestedBy,
    requestedAt: approval?.requestedAt ?? null,
    decidedBy: approval?.decidedBy ?? task.approvedBy,
    decidedAt: approval?.decidedAt ?? task.approvedAt,
    reason: approval?.reason ?? task.approvalReason,
  };
}

function buildAuditNotes(auditNotes: ReadonlyArray<ReadModelAuditNote>): ReadonlyArray<TaskWorkflowAuditNote> {
  return [...auditNotes]
    .sort((left, right) => compareDescending(left.createdAt, right.createdAt) || right.id.localeCompare(left.id))
    .map((auditNote) => ({
      id: auditNote.id,
      message: auditNote.message,
      source: auditNote.source,
      confidence: auditNote.confidence,
      createdAt: auditNote.createdAt,
    }));
}

function buildTaskMetrics(task: ReadModelTask, approvalState: TaskWorkflowApprovalState): ReadonlyArray<{ readonly label: string; readonly value: string; readonly note: string }> {
  return [
    { label: "Progress", value: `${task.progress}%`, note: task.status === "done" ? "Task is complete" : "Vault-backed progress" },
    { label: "Approval", value: approvalState.status === "not-needed" ? "Not needed" : approvalState.status === "pending" ? "Pending" : approvalState.status, note: approvalState.needed ? "Human gate visible" : "No gate required" },
    { label: "Dependencies", value: String(task.dependsOn.length), note: task.dependsOn.length === 0 ? "Independent task" : "Linked vault records" },
    { label: "Status", value: task.status, note: task.columnId ?? task.status },
  ];
}

function buildTimeline(task: ReadModelTask, approvalState: TaskWorkflowApprovalState, approvals: ReadonlyArray<TaskWorkflowApprovalRecord>): ReadonlyArray<TaskTimelineStep> {
  const steps: Array<TaskTimelineStep> = [
    {
      title: "Task recorded",
      detail: `Captured as a coordination unit in ${task.sourcePath}.`,
      timestamp: formatTimestamp(task.createdAt),
      state: "complete",
    },
  ];

  if (approvalState.needed) {
    steps.push({
      title: "Approval requested",
      detail: approvalState.requestedBy === null ? "The task is waiting for a human approval decision." : `Approval requested by ${approvalState.requestedBy}.`,
      timestamp: formatTimestamp(approvalState.requestedAt),
      state: approvalState.status === "pending" ? "current" : approvalState.status === "approved" ? "complete" : "blocked",
    });
  }

  if (task.completedAt !== null) {
    steps.push({
      title: "Task completed",
      detail: task.result ?? "The coordination item reached a completed state.",
      timestamp: formatTimestamp(task.completedAt),
      state: "complete",
    });
  } else if (task.status === "waiting-approval") {
    steps.push({
      title: "Waiting for decision",
      detail: approvalState.reason ?? "The control plane is paused until approval changes.",
      timestamp: "Now",
      state: "current",
    });
  } else if (task.status === "blocked") {
    steps.push({
      title: "Blocked",
      detail: task.blockedReason ?? "The task is blocked in the shared vault.",
      timestamp: formatTimestamp(task.blockedSince),
      state: "blocked",
    });
  } else {
    steps.push({
      title: "Active progress",
      detail: task.status === "in-progress" ? "The control plane marks this task as in progress." : "The task remains ready for the next control-plane update.",
      timestamp: "Now",
      state: "current",
    });
  }

  if (approvals.length > 0) {
    steps.push({
      title: "Linked approval record", detail: `The task references ${approvals.length} approval file${approvals.length === 1 ? "" : "s"}.`, timestamp: "Vault", state: "complete",
    });
  }

  return steps;
}

function buildFallbackTask(taskId: string): TaskWorkflowRecord {
  return {
    id: taskId,
    title: "Task unavailable",
    summary: "No live task record could be loaded from the vault yet.",
    sourcePath: `vault/shared/tasks/${taskId}.md`,
    workspaceId: "workspace-unavailable",
    workspaceName: "Workspace unavailable",
    projectId: "project-unavailable",
    projectName: "Project unavailable",
    boardId: "board-unavailable",
    boardName: "Board unavailable",
    column: "unavailable",
    status: "unavailable",
    isStale: false,
    priority: "unavailable",
    assignee: "Unassigned",
    createdBy: "Unknown",
    createdAt: "",
    updatedAt: "",
    progress: 0,
    approvalNeeded: false,
    approvalState: {
      status: "not-needed",
      needed: false,
      outcome: "pending",
      requestedBy: null,
      requestedAt: null,
      decidedBy: null,
      decidedAt: null,
      reason: null,
    },
    blockedReason: null,
    blockedSince: null,
    result: null,
    completedAt: null,
    parentTaskId: null,
    dependsOn: [],
    tags: [],
    links: [],
    metrics: [
      { label: "Progress", value: "0%", note: "No live data" },
      { label: "Approval", value: "Not needed", note: "No live data" },
      { label: "Dependencies", value: "0", note: "No live data" },
      { label: "Status", value: "unavailable", note: "No live data" },
    ],
    timeline: [
      { title: "Task recorded", detail: "The task will populate from the vault once a shared record is available.", timestamp: "—", state: "current" },
    ],
    approvals: [],
    auditNotes: [],
  };
}

export async function loadVaultReadModel(): Promise<VaultReadModel> {
  try {
    return await $fetch<VaultReadModel>(relayhqReadModelEndpoint);
  } catch {
    return emptyVaultReadModel;
  }
}

export function selectTaskWorkflow(model: VaultReadModel, taskId: string): TaskWorkflowRecord {
  const task = findById(model.tasks, taskId);

  if (task === null) {
    return buildFallbackTask(taskId);
  }

  const workspace = findById(model.workspaces, task.workspaceId);
  const project = findById(model.projects, task.projectId);
  const board = findById(model.boards, task.boardId);
  const approvals = buildApprovalRecords(model.approvals.filter((approval) => approval.taskId === task.id));
  const auditNotes = buildAuditNotes(model.auditNotes.filter((auditNote) => auditNote.taskId === task.id));
  const latestApproval = selectLatestApproval(approvals);
  const approvalState = buildApprovalState(task, latestApproval);

  return {
    id: task.id,
    title: task.title,
    summary: task.body.trim().length > 0 ? task.body.trim() : `Vault-backed task record for ${task.title}.`,
    sourcePath: task.sourcePath,
    workspaceId: workspace?.id ?? task.workspaceId,
    workspaceName: workspace?.name ?? "Workspace unavailable",
    projectId: project?.id ?? task.projectId,
    projectName: project?.name ?? "Project unavailable",
    boardId: board?.id ?? task.boardId,
    boardName: board?.name ?? "Board unavailable",
    column: normalizeTaskColumn(task.columnId),
    status: task.status,
    isStale: task.isStale,
    priority: task.priority,
    assignee: task.assignee,
    createdBy: task.createdBy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    progress: task.progress,
    approvalNeeded: task.approvalNeeded,
    approvalState,
    blockedReason: task.blockedReason,
    blockedSince: task.blockedSince,
    result: task.result,
    completedAt: task.completedAt,
    parentTaskId: task.parentTaskId,
    dependsOn: task.dependsOn,
    tags: task.tags,
    links: task.links,
    metrics: buildTaskMetrics(task, approvalState),
    timeline: buildTimeline(task, approvalState, approvals),
    approvals,
    auditNotes,
    lockedBy: task.lockedBy,
    lockedAt: task.lockedAt,
    lockExpiresAt: task.lockExpiresAt,
  };
}

export function getTaskWorkflow(taskId: string, model: VaultReadModel = emptyVaultReadModel): TaskWorkflowRecord {
  return selectTaskWorkflow(model, taskId);
}

export function buildTaskWorkflowLinks(model: VaultReadModel): ReadonlyArray<{ readonly label: string; readonly href: string; readonly note: string }> {
  return selectWorkspaceLinks(model);
}
