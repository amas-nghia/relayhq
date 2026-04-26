type FetchLike = typeof fetch;

export type TaskStatus = "todo" | "scheduled" | "in-progress" | "blocked" | "review" | "waiting-approval" | "done" | "cancelled";
export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface RelayHQSkill {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly content: string;
}

export interface RelayHQTaskSummary {
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly assignee: string;
  readonly column: string;
  readonly progress: number;
  readonly boardId: string;
  readonly projectId?: string;
}

export interface RelayHQContextResponse {
  readonly skills: ReadonlyArray<RelayHQSkill>;
  readonly [key: string]: unknown;
}

export interface RelayHQBootstrapResponse {
  readonly skills: ReadonlyArray<RelayHQSkill>;
  readonly [key: string]: unknown;
}

export interface RelayHQSessionResponse {
  readonly sessionToken: string;
  readonly etag: string;
  readonly snapshot_hash: string;
  readonly changed?: false;
  readonly protocol?: unknown;
  readonly context?: RelayHQContextResponse;
  readonly tasks?: ReadonlyArray<RelayHQTaskSummary> | null;
  readonly bootstrap?: RelayHQBootstrapResponse | { readonly changed: false; readonly etag: string } | null;
  readonly [key: string]: unknown;
}

export interface RelayHQAgentSdkOptions {
  readonly baseUrl: string;
  readonly fetchFn?: FetchLike;
}

export interface SessionStartOptions {
  readonly agentId: string;
  readonly taskId?: string;
  readonly sessionToken?: string;
  readonly since?: string;
  readonly includeProtocol?: boolean;
  readonly includeTasks?: boolean;
  readonly inlineContextFiles?: boolean;
}

export interface ClaimOptions {
  readonly agentId: string;
}

export interface HeartbeatOptions {
  readonly agentId: string;
}

export interface CompleteOptions {
  readonly agentId: string;
  readonly result: string;
  readonly progress?: number;
  readonly status?: Exclude<TaskStatus, "todo" | "scheduled" | "in-progress" | "blocked" | "waiting-approval">;
}

export interface ApprovalOptions {
  readonly agentId: string;
  readonly reason: string;
}

export interface ScheduleOptions {
  readonly agentId: string;
  readonly nextRunAt: string;
  readonly reason?: string;
}

export class RelayHQError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "RelayHQError";
    this.statusCode = statusCode;
  }
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (normalized.length === 0) {
    throw new RelayHQError("RelayHQ baseUrl is required.");
  }
  return normalized;
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim().length > 0) return payload;
  if (typeof payload !== "object" || payload === null) return fallback;
  const record = payload as { message?: string; statusMessage?: string; error?: string };
  return record.message ?? record.statusMessage ?? record.error ?? fallback;
}

async function request<T>(fetchFn: FetchLike, url: string, init?: RequestInit): Promise<T> {
  const response = await fetchFn(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new RelayHQError(extractErrorMessage(payload, `RelayHQ request failed with status ${response.status}.`), response.status);
  }

  return payload as T;
}

export class RelayHQClient {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;

  constructor(options: RelayHQAgentSdkOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async sessionStart(options: SessionStartOptions): Promise<RelayHQSessionResponse> {
    const searchParams = new URLSearchParams({ agent: options.agentId });
    if (options.taskId !== undefined) searchParams.set("taskId", options.taskId);
    if (options.sessionToken !== undefined) searchParams.set("sessionToken", options.sessionToken);
    if (options.since !== undefined) searchParams.set("since", options.since);
    if (options.includeProtocol === false) searchParams.set("includeProtocol", "false");
    if (options.includeTasks === false) searchParams.set("includeTasks", "false");
    if (options.inlineContextFiles === true) searchParams.set("inline", "true");

    return await request<RelayHQSessionResponse>(this.fetchFn, `${this.baseUrl}/api/agent/session?${searchParams.toString()}`, { method: "GET" });
  }

  async claim(taskId: string, options: ClaimOptions): Promise<unknown> {
    return await request(this.fetchFn, `${this.baseUrl}/api/vault/tasks/${encodeURIComponent(taskId)}/claim`, {
      method: "POST",
      body: JSON.stringify({ actorId: options.agentId, assignee: options.agentId }),
    });
  }

  async heartbeat(taskId: string, options: HeartbeatOptions): Promise<unknown> {
    return await request(this.fetchFn, `${this.baseUrl}/api/vault/tasks/${encodeURIComponent(taskId)}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ actorId: options.agentId }),
    });
  }

  async complete(taskId: string, options: CompleteOptions): Promise<unknown> {
    return await request(this.fetchFn, `${this.baseUrl}/api/vault/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        actorId: options.agentId,
        patch: {
          status: options.status ?? "review",
          progress: options.progress ?? 100,
          result: options.result,
        },
      }),
    });
  }

  async requestApproval(taskId: string, options: ApprovalOptions): Promise<unknown> {
    return await request(this.fetchFn, `${this.baseUrl}/api/vault/tasks/${encodeURIComponent(taskId)}/request-approval`, {
      method: "POST",
      body: JSON.stringify({ actorId: options.agentId, reason: options.reason }),
    });
  }

  async schedule(taskId: string, options: ScheduleOptions): Promise<unknown> {
    return await request(this.fetchFn, `${this.baseUrl}/api/vault/tasks/${encodeURIComponent(taskId)}/schedule`, {
      method: "POST",
      body: JSON.stringify({ actorId: options.agentId, nextRunAt: options.nextRunAt, ...(options.reason === undefined ? {} : { reason: options.reason }) }),
    });
  }
}

export function createRelayHQClient(options: RelayHQAgentSdkOptions): RelayHQClient {
  return new RelayHQClient(options);
}
