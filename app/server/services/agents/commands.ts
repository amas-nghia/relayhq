import type { TaskFrontmatter, TaskStatus } from "../../../shared/vault/schema";

import { RELAYHQ_PROTOCOL_COMMANDS, selectReadyTasksForCaller, type RelayHQProtocolCommandName } from "./protocol";

export interface RelayHQListTasksRequest {
  readonly callerId?: string;
  readonly assignee: string;
  readonly tasks: ReadonlyArray<TaskFrontmatter>;
  readonly now?: Date;
  readonly staleAfterMs?: number;
}

export interface RelayHQClaimTaskRequest {
  readonly taskId: string;
  readonly assignee: string;
  readonly startedAt: string;
}

export interface RelayHQUpdateTaskRequest {
  readonly taskId: string;
  readonly assignee: string;
  readonly status: TaskStatus;
  readonly updatedAt: string;
  readonly progress?: number;
  readonly result?: string;
  readonly completedAt?: string;
}

export interface RelayHQHeartbeatRequest {
  readonly taskId: string;
  readonly assignee: string;
  readonly heartbeatAt: string;
}

export interface RelayHQApprovalRequest {
  readonly taskId: string;
  readonly assignee: string;
  readonly reason: string;
  readonly requestedAt: string;
}

export interface RelayHQScheduleRequest {
  readonly taskId: string;
  readonly assignee: string;
  readonly nextRunAt: string;
  readonly reason?: string;
}

export interface RelayHQProtocolClient {
  readonly listTasks: (assignee: string) => Promise<ReadonlyArray<TaskFrontmatter>>;
  readonly claimTask: (request: RelayHQClaimTaskRequest) => Promise<unknown>;
  readonly updateTaskStatus: (request: RelayHQUpdateTaskRequest) => Promise<unknown>;
  readonly sendHeartbeat: (request: RelayHQHeartbeatRequest) => Promise<unknown>;
  readonly requestApproval: (request: RelayHQApprovalRequest) => Promise<unknown>;
  readonly scheduleTask: (request: RelayHQScheduleRequest) => Promise<unknown>;
}

export interface RelayHQCommandSurfaceItem {
  readonly name: RelayHQProtocolCommandName;
  readonly summary: string;
  readonly boundary: "control-plane";
  readonly usage: string;
}

export const RELAYHQ_COMMAND_SURFACE: ReadonlyArray<RelayHQCommandSurfaceItem> = RELAYHQ_PROTOCOL_COMMANDS.map((command) => ({
  name: command.name,
  summary: command.description,
  boundary: command.boundary,
  usage:
    command.name === "tasks"
      ? "relayhq tasks --assignee=<caller>"
      : command.name === "claim"
        ? "relayhq claim <task-id> --assignee=<caller>"
        : command.name === "update"
          ? "relayhq update <task-id> --assignee=<caller> --status=<status>"
          : command.name === "heartbeat"
            ? "relayhq heartbeat <task-id> --assignee=<caller>"
            : command.name === "request-approval"
              ? "relayhq request-approval <task-id> --assignee=<caller> --reason=<text>"
              : "relayhq schedule <task-id> --assignee=<caller> --next-run-at=<iso>",
}));

export interface RelayHQClaimIntent {
  readonly command: "claim";
  readonly target: "control-plane";
  readonly taskId: string;
  readonly assignee: string;
  readonly startedAt: string;
  readonly heartbeatAt: string;
  readonly status: "in-progress";
}

export interface RelayHQUpdateIntent {
  readonly command: "update";
  readonly target: "control-plane";
  readonly taskId: string;
  readonly assignee: string;
  readonly status: TaskStatus;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly progress?: number;
  readonly result?: string;
}

export interface RelayHQHeartbeatIntent {
  readonly command: "heartbeat";
  readonly target: "control-plane";
  readonly taskId: string;
  readonly assignee: string;
  readonly heartbeatAt: string;
}

export interface RelayHQApprovalIntent {
  readonly command: "request-approval";
  readonly target: "control-plane";
  readonly taskId: string;
  readonly assignee: string;
  readonly requestedAt: string;
  readonly reason: string;
  readonly status: "waiting-approval";
  readonly approvalNeeded: true;
}

export interface RelayHQScheduleIntent {
  readonly command: "schedule";
  readonly target: "control-plane";
  readonly taskId: string;
  readonly assignee: string;
  readonly nextRunAt: string;
  readonly reason?: string;
  readonly status: "scheduled";
}

export type RelayHQWritebackIntent =
  | RelayHQClaimIntent
  | RelayHQUpdateIntent
  | RelayHQHeartbeatIntent
  | RelayHQApprovalIntent
  | RelayHQScheduleIntent;

export function createClaimIntent(taskId: string, assignee: string, startedAt: string): RelayHQClaimIntent {
  return {
    command: "claim",
    target: "control-plane",
    taskId,
    assignee,
    startedAt,
    heartbeatAt: startedAt,
    status: "in-progress",
  };
}

export function createUpdateIntent(
  taskId: string,
  assignee: string,
  status: TaskStatus,
  updatedAt: string,
  progress?: number,
  result?: string,
): RelayHQUpdateIntent {
  const completedAt = status === "review" || status === "done" ? updatedAt : undefined;

  return {
    command: "update",
    target: "control-plane",
    taskId,
    assignee,
    status,
    updatedAt,
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(progress === undefined ? {} : { progress }),
    ...(result === undefined ? {} : { result }),
  };
}

export function createHeartbeatIntent(taskId: string, assignee: string, heartbeatAt: string): RelayHQHeartbeatIntent {
  return {
    command: "heartbeat",
    target: "control-plane",
    taskId,
    assignee,
    heartbeatAt,
  };
}

export function createApprovalIntent(
  taskId: string,
  assignee: string,
  reason: string,
  requestedAt: string,
): RelayHQApprovalIntent {
  return {
    command: "request-approval",
    target: "control-plane",
    taskId,
    assignee,
    requestedAt,
    reason,
    status: "waiting-approval",
    approvalNeeded: true,
  };
}

export function createScheduleIntent(
  taskId: string,
  assignee: string,
  nextRunAt: string,
  reason?: string,
): RelayHQScheduleIntent {
  return {
    command: "schedule",
    target: "control-plane",
    taskId,
    assignee,
    nextRunAt,
    ...(reason === undefined ? {} : { reason }),
    status: "scheduled",
  };
}

export function listReadyTasksForCaller(request: RelayHQListTasksRequest): ReadonlyArray<TaskFrontmatter> {
  return selectReadyTasksForCaller({ ...request, callerId: request.callerId ?? request.assignee });
}
