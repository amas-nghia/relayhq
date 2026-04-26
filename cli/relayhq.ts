import { readFile, writeFile } from "node:fs/promises";
import type { ReadModelTask, VaultReadModel } from "../app/server/models/read-model";
import type { TaskFrontmatter, TaskStatus } from "../app/shared/vault/schema";
import { indexCodebaseFiles } from "../app/server/services/kioku/code-indexer";
import { indexProjectCodebase } from "../app/server/services/kioku/project-index";
import { getKiokuStorage } from "../app/server/services/kioku/storage";
import { resolveVaultWorkspaceRoot } from "../app/server/services/vault/runtime";
import { dirname, join } from "node:path";

import {
  createApprovalIntent,
  createClaimIntent,
  createHeartbeatIntent,
  createScheduleIntent,
  createUpdateIntent,
  listReadyTasksForCaller,
  RELAYHQ_COMMAND_SURFACE,
  type RelayHQProtocolClient,
  type RelayHQWritebackIntent,
} from "../app/server/services/agents/commands";
import { TASK_STATUSES } from "../app/shared/vault/schema";

const DEFAULT_RELAYHQ_BASE_URL = "http://127.0.0.1:44210";

type FetchLike = typeof fetch;

interface RelayHQCliEnvironment {
  readonly RELAYHQ_BASE_URL?: string;
  readonly RELAYHQ_VAULT_ROOT?: string;
  readonly GITHUB_TOKEN?: string;
}

interface RelayHQDotfileConfig {
  readonly RELAYHQ_BASE_URL?: string;
  readonly RELAYHQ_VAULT_ROOT?: string;
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
  readonly payload: ReadonlyArray<TaskFrontmatter> | RelayHQWritebackIntent | ReadonlyArray<string> | Record<string, unknown>;
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

async function readRelayHQConfig(startDirectory: string): Promise<RelayHQDotfileConfig | null> {
  let currentDirectory = startDirectory;

  for (;;) {
    const configPath = join(currentDirectory, ".relayhq");
    try {
      const content = await readFile(configPath, "utf8");
      const entries = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#"));
      const config: Record<string, string> = {};
      for (const entry of entries) {
        const [key, ...rest] = entry.split("=");
        if (!key || rest.length === 0) continue;
        config[key] = rest.join("=").trim();
      }
      return config;
    } catch {
      const parent = dirname(currentDirectory);
      if (parent === currentDirectory) {
        return null;
      }
      currentDirectory = parent;
    }
  }
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

  if (status === "review") {
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
    tokens_used: task.tokensUsed ?? null,
    model: task.model ?? null,
    cost_usd: task.costUsd ?? null,
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

async function requestGitHub<TResponse>(url: string, token: string): Promise<TResponse> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "relayhq-cli",
    },
  });
  const payload = await parseRelayHQResponse(response);
  if (!response.ok) {
    throw new Error(extractRelayHQErrorMessage(payload, `GitHub request failed with status ${response.status}.`));
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

export async function resolveRelayHQBaseUrl(
  argv: ReadonlyArray<string>,
  env: RelayHQCliEnvironment = process.env as RelayHQCliEnvironment,
): Promise<string> {
  const invocation = parseRelayHQInvocation(argv);
  if (invocation.flags.get("base-url") !== undefined) {
    return normalizeBaseUrl(invocation.flags.get("base-url")!);
  }
  if (env.RELAYHQ_BASE_URL !== undefined) {
    return normalizeBaseUrl(env.RELAYHQ_BASE_URL);
  }
  const config = await readRelayHQConfig(process.cwd());
  if (config?.RELAYHQ_BASE_URL !== undefined) {
    return normalizeBaseUrl(config.RELAYHQ_BASE_URL);
  }
  return DEFAULT_RELAYHQ_BASE_URL;
}

async function resolveRelayHQVaultRoot(env: RelayHQCliEnvironment = process.env as RelayHQCliEnvironment): Promise<string> {
  if (env.RELAYHQ_VAULT_ROOT !== undefined) {
    return env.RELAYHQ_VAULT_ROOT;
  }
  const config = await readRelayHQConfig(process.cwd());
  if (config?.RELAYHQ_VAULT_ROOT !== undefined) {
    return config.RELAYHQ_VAULT_ROOT;
  }
  return resolveVaultWorkspaceRoot();
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
    scheduleTask: async (request) =>
      await requestRelayHQ(fetchFn, `${baseUrl}/api/vault/tasks/${encodeURIComponent(request.taskId)}/schedule`, {
        method: "POST",
        body: JSON.stringify({ actorId: request.assignee, nextRunAt: request.nextRunAt, ...(request.reason === undefined ? {} : { reason: request.reason }) }),
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
    "relayhq index <path>  # Index a single codebase path into Kioku",
    "relayhq index --project=<projectId>  # Index all configured codebases for a project",
    "relayhq init  # Write a local .relayhq file from server settings",
    `Base URL: --base-url=<url> or RELAYHQ_BASE_URL (default: ${DEFAULT_RELAYHQ_BASE_URL})`,
  ];
}

function upsertUpdates(updates: ReadonlyArray<{ readonly document: { readonly entityId: string; readonly updatedAt: string } }>, storage: ReturnType<typeof getKiokuStorage>) {
  let indexedFiles = 0;
  for (const update of updates) {
    const existing = storage.fetchById(update.document.entityId);
    if (existing?.updatedAt === update.document.updatedAt) {
      continue;
    }
    storage.upsert(update.document as never);
    indexedFiles += 1;
  }
  return indexedFiles;
}

export async function executeRelayHQInvocation(
  client: RelayHQProtocolClient,
  argv: ReadonlyArray<string>,
  now: Date = new Date(),
): Promise<RelayHQCliResult> {
  const invocation = parseRelayHQInvocation(argv);

  if (invocation.command === "init") {
    const baseUrl = await resolveRelayHQBaseUrl(argv);
    const settings = await requestRelayHQ<{ vaultRoot: string | null; resolvedRoot: string }>(fetch, `${baseUrl}/api/settings`, { method: "GET" });
    const vaultRoot = settings.vaultRoot ?? settings.resolvedRoot;
    const configPath = join(process.cwd(), ".relayhq");
    await writeFile(configPath, `RELAYHQ_BASE_URL=${baseUrl}\nRELAYHQ_VAULT_ROOT=${vaultRoot}\n`, "utf8");
    return { command: "init", payload: { path: configPath, baseUrl, vaultRoot } };
  }

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

  if (invocation.command === "schedule") {
    const [taskId = ""] = invocation.positional;
    const assignee = requireNonEmpty(invocation.flags.get("assignee") ?? "", "assignee is required");
    const validatedTaskId = requireNonEmpty(taskId, "task id is required");
    const nextRunAt = invocation.flags.get("next-run-at");
    const retryAfterSeconds = invocation.flags.get("retry-after-seconds");

    let resolvedNextRunAt = nextRunAt;
    if (resolvedNextRunAt === undefined && retryAfterSeconds !== undefined) {
      const seconds = Number(retryAfterSeconds);
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error("retry-after-seconds must be a positive number.");
      }
      resolvedNextRunAt = new Date(now.getTime() + seconds * 1000).toISOString();
    }

    const payload = createScheduleIntent(
      validatedTaskId,
      assignee,
      requireNonEmpty(resolvedNextRunAt ?? "", "next-run-at or retry-after-seconds is required"),
      invocation.flags.get("reason") ?? undefined,
    );
    await client.scheduleTask(payload);
    return { command: "schedule", payload };
  }

  if (invocation.command === "spawn-subtask") {
    const [taskId = ""] = invocation.positional;
    const validatedTaskId = requireNonEmpty(taskId, "task id is required");
    const title = requireNonEmpty(invocation.flags.get("title") ?? "", "title is required");
    const priority = invocation.flags.get("priority") ?? "medium";
    const objective = invocation.flags.get("objective") ?? undefined;
    const requiredCapability = invocation.flags.get("required-capability") ?? undefined;
    const response = await requestRelayHQ(fetchFnForClient(client), `${await resolveRelayHQBaseUrl(argv)}/api/vault/tasks/${encodeURIComponent(validatedTaskId)}/spawn-subtask`, {
      method: "POST",
      body: JSON.stringify({
        title,
        priority,
        ...(objective === undefined ? {} : { objective }),
        ...(requiredCapability === undefined ? {} : { requiredCapability }),
      }),
    });
    return { command: "spawn-subtask", payload: response as Record<string, unknown> };
  }

  if (invocation.command === "index") {
    const storage = getKiokuStorage();
    const projectId = invocation.flags.get("project");

    if (projectId !== undefined && projectId.trim().length > 0) {
      const model = await requestRelayHQ<VaultReadModel>(fetchFnForClient(client), `${await resolveRelayHQBaseUrl(argv)}/api/vault/read-model`, { method: "GET" });
      const project = model.projects.find((entry) => entry.id === projectId.trim());
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }
      const result = indexProjectCodebase(project, await resolveRelayHQVaultRoot(), storage);
      return {
        command: "index",
        payload: {
          projectId: project.id,
          indexedFiles: result.indexedFiles,
          resolvedPaths: result.resolvedPaths,
          warnings: result.warnings,
        },
      };
    }

    const [path = ""] = invocation.positional;
    const validatedPath = requireNonEmpty(path, "path is required unless --project=<id> is used");
    const updates = indexCodebaseFiles(validatedPath);
    const indexedFiles = upsertUpdates(updates, storage);
    return {
      command: "index",
      payload: {
        path: validatedPath,
        indexedFiles,
      },
    };
  }

  if (invocation.command === "sync") {
    const githubRepo = invocation.flags.get("github");
    if (githubRepo === undefined) {
      throw new Error("--github <owner/repo> is required");
    }

    const token = invocation.flags.get("token") ?? process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GitHub token is required via --token or GITHUB_TOKEN.");
    }

    const [owner, repo] = githubRepo.split("/");
    if (!owner || !repo) {
      throw new Error("--github must be in owner/repo format.");
    }

    const baseUrl = await resolveRelayHQBaseUrl(argv);
    const model = await requestRelayHQ<VaultReadModel>(fetchFnForClient(client), `${baseUrl}/api/vault/read-model`, { method: "GET" });
    const targetProject = model.projects[0];
    const targetBoard = model.boards.find((board) => board.projectId === targetProject?.id);
    const todoColumn = model.columns.find((column) => column.boardId === targetBoard?.id && column.name.toLowerCase() === "todo") ?? model.columns.find((column) => column.boardId === targetBoard?.id);
    if (!targetProject || !targetBoard || !todoColumn) {
      throw new Error("A project, board, and todo column are required before GitHub sync can create tasks.");
    }

    const issues = await requestGitHub<ReadonlyArray<{ number: number; title: string; body: string | null; labels: ReadonlyArray<{ name: string }>; assignees: ReadonlyArray<{ login: string }> }>>(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`,
      token,
    );

    let created = 0;
    let skipped = 0;
    for (const issue of issues.filter((entry) => !("pull_request" in (entry as object)))) {
      const existing = model.tasks.find((task) => task.githubIssueId === String(issue.number));
      if (existing) {
        skipped += 1;
        continue;
      }

      await requestRelayHQ(fetchFnForClient(client), `${baseUrl}/api/vault/tasks`, {
        method: "POST",
        body: JSON.stringify({
          title: issue.title,
          projectId: targetProject.id,
          boardId: targetBoard.id,
          columnId: todoColumn.id,
          priority: "medium",
          assignee: issue.assignees[0]?.login ?? "claude-code",
          objective: issue.body ?? issue.title,
          acceptanceCriteria: ["Issue is synced from GitHub", "Task is visible in RelayHQ"],
          contextFiles: [],
          constraints: [],
          tags: issue.labels.map((label) => label.name),
          github_issue_id: String(issue.number),
        }),
      });
      created += 1;
    }

    return { command: "sync", payload: { created, skipped } };
  }

  return { command: "help", payload: renderRelayHQHelp() };
}

function fetchFnForClient(client?: RelayHQProtocolClient): FetchLike {
  return client ? fetch : fetch;
}

export async function main(
  argv: ReadonlyArray<string> = process.argv.slice(2),
  client?: RelayHQProtocolClient,
): Promise<RelayHQCliResult> {
  const result = await executeRelayHQInvocation(client ?? createRelayHQHttpProtocolClient({ baseUrl: await resolveRelayHQBaseUrl(argv) }), argv);
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
