import type { ReadModelTask, VaultReadModel } from "../app/server/models/read-model";
import type { TaskFrontmatter, TaskStatus } from "../app/shared/vault/schema";

import {
  createApprovalIntent,
  createClaimIntent,
  createHeartbeatIntent,
  createUpdateIntent,
  listReadyTasksForCaller,
  RELAYHQ_COMMAND_SURFACE,
  type RelayHQProtocolClient,
  type RelayHQWritebackIntent,
} from "../app/server/services/agents/commands";
import { TASK_STATUSES } from "../app/shared/vault/schema";

const DEFAULT_RELAYHQ_BASE_URL = "http://127.0.0.1:3000";

type FetchLike = typeof fetch;

interface RelayHQCliEnvironment {
  readonly RELAYHQ_BASE_URL?: string;
}

interface RelayHQHttpProtocolClientOptions {
  readonly baseUrl: string;
  readonly fetchFn?: FetchLike;
}

interface RelayHQErrorPayload {
  readonly message?: string;
  readonly statusMessage?: string;
  readonly statusText?: string;
  readonly error?: string;
}

export interface RelayHQCliInvocation {
  readonly command: string;
  readonly positional: ReadonlyArray<string>;
  readonly flags: ReadonlyMap<string, string>;
}

export interface RelayHQCliResult {
  readonly command: string;
  readonly payload: ReadonlyArray<TaskFrontmatter> | RelayHQWritebackIntent | ReadonlyArray<string>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (normalized.length === 0) {
    throw new Error("RelayHQ base URL is required");
  }

  return normalized;
}

function deriveColumnFromStatus(status: TaskStatus): TaskFrontmatter["column"] | undefined {
  if (status === "todo") {
    return "todo";
  }

  if (status === "in-progress") {
    return "in-progress";
  }

  if (status === "waiting-approval") {
    return "review";
  }

  if (status === "done") {
    return "done";
  }

  return undefined;
}

function toTaskFrontmatter(task: ReadModelTask): TaskFrontmatter {
  return {
    id: task.id,
    type: "task",
    version: 1,
    workspace_id: task.workspaceId,
    project_id: task.projectId,
    board_id: task.boardId,
    column: task.columnId as TaskFrontmatter["column"],
    status: task.status,
    priority: task.priority,
    title: task.title,
    assignee: task.assignee,
    created_by: task.createdBy,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    heartbeat_at: task.heartbeatAt,
    execution_started_at: task.executionStartedAt,
    execution_notes: task.executionNotes,
    progress: task.progress,
    approval_needed: task.approvalNeeded,
    approval_requested_by: task.approvalRequestedBy,
    approval_reason: task.approvalReason,
    approved_by: task.approvedBy,
    approved_at: task.approvedAt,
    approval_outcome: task.approvalOutcome,
    blocked_reason: task.blockedReason,
    blocked_since: task.blockedSince,
    result: task.result,
    completed_at: task.completedAt,
    parent_task_id: task.parentTaskId,
    depends_on: task.dependsOn,
    tags: task.tags,
    links: task.links.map((link) => ({ project: link.projectId, thread: link.threadId })),
    locked_by: task.lockedBy,
    locked_at: task.lockedAt,
    lock_expires_at: task.lockExpiresAt,
  };
}

async function parseRelayHQResponse(response: Response): Promise<unknown> {
  const rawBody = await response.text();
  if (rawBody.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

function extractRelayHQErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim().length > 0) {
    return payload;
  }

  if (!isPlainRecord(payload)) {
    return fallback;
  }

  const { message, statusMessage, statusText, error } = payload as RelayHQErrorPayload;
  const candidate = [message, statusMessage, statusText, error].find((value) => typeof value === "string" && value.trim().length > 0);
  return candidate ?? fallback;
}

async function requestRelayHQ<TResponse>(fetchFn: FetchLike, url: string, init?: RequestInit): Promise<TResponse> {
  const response = await fetchFn(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await parseRelayHQResponse(response);

  if (!response.ok) {
    throw new Error(extractRelayHQErrorMessage(payload, `RelayHQ request failed with status ${response.status}.`));
  }

  return payload as TResponse;
}

function buildUpdatePatch(request: Parameters<RelayHQProtocolClient["updateTaskStatus"]>[0]): Readonly<Partial<TaskFrontmatter>> {
  const column = deriveColumnFromStatus(request.status);

  return {
    status: request.status,
    ...(column === undefined ? {} : { column }),
    ...(request.progress === undefined ? {} : { progress: request.progress }),
    ...(request.result === undefined ? {} : { result: request.result }),
    ...(request.completedAt === undefined ? {} : { completed_at: request.completedAt }),
    ...(request.status === "in-progress" ? { execution_started_at: request.updatedAt } : {}),
  };
}

export function resolveRelayHQBaseUrl(
  argv: ReadonlyArray<string>,
  env: RelayHQCliEnvironment = process.env as RelayHQCliEnvironment,
): string {
  const invocation = parseRelayHQInvocation(argv);
  return normalizeBaseUrl(invocation.flags.get("base-url") ?? env.RELAYHQ_BASE_URL ?? DEFAULT_RELAYHQ_BASE_URL);
}

export function createRelayHQHttpProtocolClient(options: RelayHQHttpProtocolClientOptions): RelayHQProtocolClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchFn = options.fetchFn ?? fetch;

  return {
    listTasks: async (assignee) => {
      const model = await requestRelayHQ<VaultReadModel>(fetchFn, `${baseUrl}/api/vault/read-model`, { method: "GET" });
      return model.tasks.filter((task) => task.assignee === assignee).map(toTaskFrontmatter);
    },
    claimTask: async (request) =>
      await requestRelayHQ(fetchFn, `${baseUrl}/api/vault/tasks/${encodeURIComponent(request.taskId)}/claim`, {
        method: "POST",
        body: JSON.stringify({ actorId: request.assignee, assignee: request.assignee }),
      }),
    updateTaskStatus: async (request) =>
      await requestRelayHQ(fetchFn, `${baseUrl}/api/vault/tasks/${encodeURIComponent(request.taskId)}`, {
        method: "PATCH",
        body: JSON.stringify({ actorId: request.assignee, patch: buildUpdatePatch(request) }),
      }),
    sendHeartbeat: async (request) =>
      await requestRelayHQ(fetchFn, `${baseUrl}/api/vault/tasks/${encodeURIComponent(request.taskId)}/heartbeat`, {
        method: "POST",
        body: JSON.stringify({ actorId: request.assignee }),
      }),
    requestApproval: async (request) =>
      await requestRelayHQ(fetchFn, `${baseUrl}/api/vault/tasks/${encodeURIComponent(request.taskId)}/request-approval`, {
        method: "POST",
        body: JSON.stringify({ actorId: request.assignee, reason: request.reason }),
      }),
  };
}

function parseFlags(args: ReadonlyArray<string>): ReadonlyMap<string, string> {
  const flags = new Map<string, string>();

  for (const arg of args) {
    if (!arg.startsWith("--")) {
      continue;
    }

    const body = arg.slice(2);
    const equalsIndex = body.indexOf("=");
    const key = equalsIndex === -1 ? body : body.slice(0, equalsIndex);
    const rawValue = equalsIndex === -1 ? "true" : body.slice(equalsIndex + 1);
    flags.set(key, rawValue);
  }

  return flags;
}

function requireNonEmpty(value: string, message: string): string {
  if (value.trim().length === 0) {
    throw new Error(message);
  }

  return value;
}

function requireTaskStatus(value: string): TaskFrontmatter["status"] {
  if (!TASK_STATUSES.includes(value as TaskFrontmatter["status"])) {
    throw new Error(`Invalid status '${value}'.`);
  }

  return value as TaskFrontmatter["status"];
}

function requireProgress(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const progress = Number(value);
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw new Error(`Invalid progress '${value}'.`);
  }

  return progress;
}

export function parseRelayHQInvocation(argv: ReadonlyArray<string>): RelayHQCliInvocation {
  const [command = "help", ...rest] = argv;
  const positional = rest.filter((arg) => !arg.startsWith("--"));
  return { command, positional, flags: parseFlags(rest) };
}

export function renderRelayHQHelp(): ReadonlyArray<string> {
  return [
    "RelayHQ CLI",
    ...RELAYHQ_COMMAND_SURFACE.map((command) => `${command.usage}  # ${command.summary}`),
    `Base URL: --base-url=<url> or RELAYHQ_BASE_URL (default: ${DEFAULT_RELAYHQ_BASE_URL})`,
  ];
}

export async function executeRelayHQInvocation(
  client: RelayHQProtocolClient,
  argv: ReadonlyArray<string>,
  now: Date = new Date(),
): Promise<RelayHQCliResult> {
  const invocation = parseRelayHQInvocation(argv);

  if (invocation.command === "tasks") {
    const assignee = requireNonEmpty(invocation.flags.get("assignee") ?? "", "assignee is required");
    const tasks = await client.listTasks(assignee);
    return { command: "tasks", payload: listReadyTasksForCaller({ callerId: assignee, assignee, tasks, now }) };
  }

  if (invocation.command === "claim") {
    const [taskId = ""] = invocation.positional;
    const assignee = requireNonEmpty(invocation.flags.get("assignee") ?? "", "assignee is required");
    const validatedTaskId = requireNonEmpty(taskId, "task id is required");
    const payload = createClaimIntent(validatedTaskId, assignee, now.toISOString());
    await client.claimTask(payload);
    return { command: "claim", payload };
  }

  if (invocation.command === "update") {
    const [taskId = ""] = invocation.positional;
    const assignee = requireNonEmpty(invocation.flags.get("assignee") ?? "", "assignee is required");
    const validatedTaskId = requireNonEmpty(taskId, "task id is required");
    const status = requireTaskStatus(invocation.flags.get("status") ?? "in-progress");
    const progress = requireProgress(invocation.flags.get("progress"));
    const result = invocation.flags.get("result");
    const payload = createUpdateIntent(validatedTaskId, assignee, status, now.toISOString(), progress, result);
    await client.updateTaskStatus(payload);
    return { command: "update", payload };
  }

  if (invocation.command === "heartbeat") {
    const [taskId = ""] = invocation.positional;
    const assignee = requireNonEmpty(invocation.flags.get("assignee") ?? "", "assignee is required");
    const validatedTaskId = requireNonEmpty(taskId, "task id is required");
    const payload = createHeartbeatIntent(validatedTaskId, assignee, now.toISOString());
    await client.sendHeartbeat(payload);
    return { command: "heartbeat", payload };
  }

  if (invocation.command === "request-approval") {
    const [taskId = ""] = invocation.positional;
    const assignee = requireNonEmpty(invocation.flags.get("assignee") ?? "", "assignee is required");
    const validatedTaskId = requireNonEmpty(taskId, "task id is required");
    const reason = requireNonEmpty(invocation.flags.get("reason") ?? "", "reason is required");
    const payload = createApprovalIntent(validatedTaskId, assignee, reason, now.toISOString());
    await client.requestApproval(payload);
    return {
      command: "request-approval",
      payload,
    };
  }

  return { command: "help", payload: renderRelayHQHelp() };
}

export async function main(
  argv: ReadonlyArray<string> = process.argv.slice(2),
  client?: RelayHQProtocolClient,
): Promise<RelayHQCliResult> {
  const result = await executeRelayHQInvocation(client ?? createRelayHQHttpProtocolClient({ baseUrl: resolveRelayHQBaseUrl(argv) }), argv);
  if (result.command === "help" && Array.isArray(result.payload)) {
    process.stdout.write(`${result.payload.join("\n")}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  return result;
}

if (import.meta.main) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
