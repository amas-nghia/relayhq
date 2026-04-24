import { defineEventHandler, getQuery } from "h3";

import { filterVaultReadModelByWorkspaceId } from "../../models/read-model";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, readExposedVaultRoot, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";
import { countTokens, computeSaving, recordTokenSaving } from "../../services/metrics/tracker";
import { sessionStore as defaultSessionStore, type SessionStore } from "../../services/session/store";
import { readAgentContext, type AgentContextResponse } from "./context.get";
import { readTaskBootstrapPack, type BootstrapPack, type BootstrapUnchanged } from "./bootstrap/[taskId].get";

export interface AgentSlimTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly assignee: string;
  readonly column: string;
  readonly progress: number;
  readonly boardId: string;
}

export interface AgentSessionUnchanged {
  readonly changed: false;
  readonly vaultRoot?: string;
  readonly sessionToken: string;
  readonly etag: string;
}

export interface AgentSessionFullResponse {
  readonly vaultRoot?: string;
  readonly sessionToken: string;
  readonly etag: string;
  readonly protocol: AgentSessionProtocol | null;
  readonly context: AgentContextResponse;
  readonly tasks: ReadonlyArray<AgentSlimTask> | null;
  readonly bootstrap: BootstrapPack | BootstrapUnchanged | null;
}

export type AgentSessionResponse = AgentSessionFullResponse | AgentSessionUnchanged;

interface ReadAgentSessionOptions {
  readonly agent: string;
  readonly taskId?: string;
  readonly sessionToken?: string;
  readonly since?: string;
  readonly includeProtocol?: boolean;
  readonly includeTasks?: boolean;
  readonly inlineContextFiles?: boolean;
}

interface ReadAgentSessionDependencies {
  readonly resolveRoot?: () => string;
  readonly readModelReader?: typeof readCanonicalVaultReadModel;
  readonly workspaceIdReader?: typeof readConfiguredWorkspaceId;
  readonly sessionStore?: SessionStore;
  readonly now?: () => Date;
}

export interface AgentSessionProtocol {
  readonly workspaceBrief: string | null;
  readonly warning: string | null;
}

function normalizeWorkspaceBrief(body: string | null | undefined): string | null {
  const brief = body?.trim() ?? "";
  return brief.length > 0 ? brief : null;
}

export function computeSessionEtag(snapshot: Pick<AgentSessionFullResponse, "protocol" | "context" | "tasks">): string {
  const serialized = JSON.stringify(snapshot);
  let hash = 0x811c9dc5;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `sess-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export async function readAgentSession(
  options: ReadAgentSessionOptions,
  dependencies: ReadAgentSessionDependencies = {},
): Promise<AgentSessionResponse> {
  const resolveRoot = dependencies.resolveRoot ?? resolveVaultWorkspaceRoot;
  const readModelReader = dependencies.readModelReader ?? readCanonicalVaultReadModel;
  const workspaceIdReader = dependencies.workspaceIdReader ?? readConfiguredWorkspaceId;
  const sessionStore = dependencies.sessionStore ?? defaultSessionStore;
  const now = dependencies.now?.() ?? new Date();
  const providedSessionToken = options.sessionToken?.trim();
  const activeSession = providedSessionToken ? sessionStore.touch(providedSessionToken, now) : null;
  const sessionToken = activeSession === null ? sessionStore.issue(options.agent, now) : providedSessionToken!;
  const vaultRoot = resolveRoot();
  const readModel = await readModelReader(vaultRoot);
  const workspaceId = normalizeConfiguredWorkspaceId(workspaceIdReader(), readModel.workspaces);
  const filteredReadModel = workspaceId === null
    ? readModel
    : filterVaultReadModelByWorkspaceId(readModel, workspaceId);

  const context = await readAgentContext({ preloadedReadModel: filteredReadModel });
  const protocol: AgentSessionProtocol | null = options.includeProtocol === false
    ? null
    : (() => {
        const workspaceBrief = normalizeWorkspaceBrief(filteredReadModel.workspaces[0]?.body);
        return {
          workspaceBrief,
          warning: workspaceBrief === null ? "Workspace brief is empty." : null,
        };
      })();

  const tasks: ReadonlyArray<AgentSlimTask> | null = options.includeTasks !== false
    ? filteredReadModel.tasks
        .filter((task) => task.status !== "done" && task.status !== "cancelled")
        .map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          assignee: task.assignee,
          column: task.columnId,
          progress: task.progress,
          boardId: task.boardId,
        }))
    : null;

  const etag = computeSessionEtag({ protocol, context, tasks });
  sessionStore.setEtag(sessionToken, etag);

  if (activeSession !== null && options.since !== undefined && options.since === etag) {
    const exposedVaultRoot = readExposedVaultRoot();
    return {
      changed: false,
      ...(exposedVaultRoot === null ? {} : { vaultRoot: exposedVaultRoot }),
      sessionToken,
      etag,
    } satisfies AgentSessionUnchanged;
  }

  let bootstrap: BootstrapPack | BootstrapUnchanged | null = null;
  if (options.taskId !== undefined && options.taskId.length > 0) {
    const pack = await readTaskBootstrapPack(options.taskId, {
      includeProtocol: options.includeProtocol,
      inlineContextFiles: options.inlineContextFiles,
      preloadedReadModel: filteredReadModel,
      resolveRoot: () => vaultRoot,
    });
    if (options.since !== undefined && options.since === pack.etag) {
      bootstrap = { changed: false, etag: pack.etag } satisfies BootstrapUnchanged;
    } else {
      bootstrap = pack;
    }
  }

  const exposedVaultRoot = readExposedVaultRoot();
  return {
    ...(exposedVaultRoot === null ? {} : { vaultRoot: exposedVaultRoot }),
    sessionToken,
    etag,
    protocol,
    context,
    tasks,
    bootstrap,
  } satisfies AgentSessionFullResponse;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const agent = String(query.agent ?? "anonymous");
  const taskId = typeof query.taskId === "string" ? query.taskId.trim() : undefined;
  const sessionToken = typeof query.sessionToken === "string" ? query.sessionToken : undefined;
  const since = typeof query.since === "string" ? query.since : undefined;
  const includeProtocol = query.protocol !== "false";
  const includeTasks = query.tasks !== "false";
  const inlineContextFiles = query.inline === "true";

  const response = await readAgentSession({
    agent,
    taskId,
    sessionToken,
    since,
    includeProtocol,
    includeTasks,
    inlineContextFiles,
  });
  const responseTokens = countTokens(response);
  const { baselineTokens, savedTokens } = computeSaving("session", responseTokens);
  recordTokenSaving({ timestamp: new Date().toISOString(), agent, endpoint: "session", taskId, responseTokens, baselineTokens, savedTokens });
  return response;
});
