import { defineEventHandler, getQuery } from "h3";

import { filterVaultReadModelByWorkspaceId, type VaultReadModel } from "../../models/read-model";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, readExposedVaultRoot, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";
import { countTokens, computeSaving, recordTokenSaving } from "../../services/metrics/tracker";
import { sessionStore as defaultSessionStore, type ActiveSession, type SessionStore } from "../../services/session/store";

export interface AgentContextProjectCodebase {
  readonly name: string;
  readonly path: string;
  readonly tech?: string;
  readonly primary?: boolean;
}

export interface AgentContextProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly boardCount: number;
  readonly openIssueCount: number;
  readonly codebases: ReadonlyArray<AgentContextProjectCodebase>;
}

export interface AgentContextColumnSummary {
  readonly id: string;
  readonly name: string;
  readonly taskCount: number;
}

export interface AgentContextBoardSummary {
  readonly id: string;
  readonly name: string;
  readonly columnSummary: ReadonlyArray<AgentContextColumnSummary>;
}

export interface AgentContextResponse {
  readonly vaultRoot?: string;
  readonly workspaceId: string | null;
  readonly workspaceName: string | null;
  readonly projects: ReadonlyArray<AgentContextProjectSummary>;
  readonly openTaskCount: number;
  readonly pendingApprovalCount: number;
  readonly boardSummary: ReadonlyArray<AgentContextBoardSummary>;
  readonly activeSessions: ReadonlyArray<ActiveSession>;
}

interface ReadAgentContextDependencies {
  readonly readModelReader?: (vaultRoot: string) => Promise<VaultReadModel>;
  readonly resolveRoot?: () => string;
  readonly workspaceIdReader?: () => string | null;
  readonly preloadedReadModel?: VaultReadModel;
  readonly sessionStore?: SessionStore;
  readonly now?: () => Date;
}

function toAgentContextResponse(readModel: VaultReadModel, activeSessions: ReadonlyArray<ActiveSession>): AgentContextResponse {
  const workspace = readModel.workspaces[0] ?? null;
  const tasksByColumnId = new Map<string, number>();
  const exposedVaultRoot = readExposedVaultRoot();

  for (const task of readModel.tasks) {
    tasksByColumnId.set(task.columnId, (tasksByColumnId.get(task.columnId) ?? 0) + 1);
  }

  return {
    ...(exposedVaultRoot === null ? {} : { vaultRoot: exposedVaultRoot }),
    workspaceId: workspace?.id ?? null,
    workspaceName: workspace?.name ?? null,
    projects: readModel.projects.map((project) => ({
      id: project.id,
      name: project.name,
      boardCount: readModel.boards.filter((board) => board.projectId === project.id).length,
      openIssueCount: (readModel.issues ?? []).filter((issue) => issue.projectId === project.id && issue.status !== "resolved" && issue.status !== "wont-fix").length,
      codebases: project.codebases,
    })),
    openTaskCount: readModel.tasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length,
    pendingApprovalCount: readModel.approvals.filter((approval) => approval.status === "pending").length,
    activeSessions,
    boardSummary: readModel.boards.map((board) => ({
      id: board.id,
      name: board.name,
      columnSummary: readModel.columns
        .filter((column) => column.boardId === board.id)
        .map((column) => ({
          id: column.id,
          name: column.name,
          taskCount: tasksByColumnId.get(column.id) ?? 0,
        })),
    })),
  };
}

export async function readAgentContext(
  dependencies: ReadAgentContextDependencies = {},
): Promise<AgentContextResponse> {
  const sessionStore = dependencies.sessionStore ?? defaultSessionStore;
  const now = dependencies.now?.() ?? new Date();
  let filteredReadModel: VaultReadModel;
  if (dependencies.preloadedReadModel !== undefined) {
    filteredReadModel = dependencies.preloadedReadModel;
  } else {
    const readModelReader = dependencies.readModelReader ?? readCanonicalVaultReadModel;
    const resolveRoot = dependencies.resolveRoot ?? resolveVaultWorkspaceRoot;
    const workspaceIdReader = dependencies.workspaceIdReader ?? readConfiguredWorkspaceId;
    const readModel = await readModelReader(resolveRoot());
    const configuredWorkspaceId = normalizeConfiguredWorkspaceId(workspaceIdReader(), readModel.workspaces);
    filteredReadModel = configuredWorkspaceId === null
      ? readModel
      : filterVaultReadModelByWorkspaceId(readModel, configuredWorkspaceId);
  }

  return toAgentContextResponse(filteredReadModel, sessionStore.getActiveSessions(now));
}

export default defineEventHandler(async (event) => {
  const agent = String(getQuery(event).agent ?? "anonymous");
  const response = await readAgentContext();
  const responseTokens = countTokens(response);
  const { baselineTokens, savedTokens } = computeSaving("context", responseTokens);
  recordTokenSaving({ timestamp: new Date().toISOString(), agent, endpoint: "context", responseTokens, baselineTokens, savedTokens });
  return response;
});
