import { defineEventHandler, getQuery } from "h3";

import { filterVaultReadModelByWorkspaceId, type VaultReadModel } from "../../models/read-model";
import { filterDocsForAgent, resolveAgentDocumentAccessContext, writeDeniedDocAccessAudit } from "../../services/authz/doc-access";
import { getRelevantDocsForTask } from "../../services/authz/relevant-docs";
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
  readonly docs: ReadonlyArray<{ id: string; title: string; doc_type: string; status: string; visibility: string; updatedAt: string }>;
  readonly relevant_docs: ReadonlyArray<{ taskId: string; docs: ReadonlyArray<{ id: string; title: string; doc_type: string; path: string; summary: string }> }>;
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

function toAgentContextResponse(readModel: VaultReadModel, activeSessions: ReadonlyArray<ActiveSession>, agentId: string | null): AgentContextResponse {
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
    docs: readModel.docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      doc_type: doc.docType,
      status: doc.status,
      visibility: doc.visibility,
      updatedAt: doc.updatedAt,
    })),
    relevant_docs: readModel.tasks
      .filter((task) => agentId !== null && task.assignee === agentId)
      .filter((task) => task.status === "in-progress" || task.status === "waiting-approval" || task.status === "blocked")
      .map((task) => ({
        taskId: task.id,
        docs: getRelevantDocsForTask(readModel, task, { agentId: task.assignee }),
      })),
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
  options: { agentId?: string | null; requestedRoles?: ReadonlyArray<string> } = {},
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

  const shouldFilterDocs = (options.agentId ?? null) !== null || (options.requestedRoles?.length ?? 0) > 0;
  const context = resolveAgentDocumentAccessContext(filteredReadModel, options.agentId ?? null, options.requestedRoles ?? []);
  const filteredDocs = !shouldFilterDocs
    ? { allowed: filteredReadModel.docs, denied: [] as typeof filteredReadModel.docs }
    : filterDocsForAgent(filteredReadModel, context);

  if (shouldFilterDocs && context.agentId !== null && filteredDocs.denied.length > 0) {
    await writeDeniedDocAccessAudit({
      vaultRoot: dependencies.resolveRoot?.() ?? resolveVaultWorkspaceRoot(),
      agentId: context.agentId,
      deniedDocIds: filteredDocs.denied.map((doc) => doc.id),
      now,
    });
  }

  return toAgentContextResponse({ ...filteredReadModel, docs: filteredDocs.allowed }, sessionStore.getActiveSessions(now), options.agentId ?? null);
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const agent = String(query.agent ?? query.agent_id ?? "anonymous");
  const requestedRoles = typeof query.roles === "string" ? query.roles.split(",") : [];
  const response = await readAgentContext({}, { agentId: typeof query.agent_id === "string" ? query.agent_id : null, requestedRoles });
  const responseTokens = countTokens(response);
  const { baselineTokens, savedTokens } = computeSaving("context", responseTokens);
  recordTokenSaving({ timestamp: new Date().toISOString(), agent, endpoint: "context", responseTokens, baselineTokens, savedTokens });
  return response;
});
