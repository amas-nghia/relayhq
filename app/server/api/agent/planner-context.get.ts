import { defineEventHandler, getQuery } from "h3";

import { filterVaultReadModelByWorkspaceId, type VaultReadModel } from "../../models/read-model";
import { filterDocsForAgent, resolveAgentDocumentAccessContext, writeDeniedDocAccessAudit } from "../../services/authz/doc-access";
import { countTokens, computeSaving, recordTokenSaving } from "../../services/metrics/tracker";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export interface PlannerContextProjectCodebase {
  readonly name: string;
  readonly path: string;
  readonly tech?: string;
  readonly primary?: boolean;
}

export interface PlannerContextProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly boardIds: ReadonlyArray<string>;
  readonly codebases: ReadonlyArray<PlannerContextProjectCodebase>;
}

export interface PlannerContextColumnSummary {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly taskCount: number;
}

export interface PlannerContextBoardSummary {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly columns: ReadonlyArray<PlannerContextColumnSummary>;
}

export interface PlannerContextAgentSummary {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ReadonlyArray<string>;
  readonly roles: ReadonlyArray<string>;
  readonly status: string;
}

export interface PlannerContextTaskSummary {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly boardId: string;
  readonly columnId: string;
  readonly assignee: string;
}

export interface PlannerContextDocSummary {
  readonly id: string;
  readonly title: string;
  readonly doc_type: string;
  readonly status: string;
  readonly updatedAt: string;
}

export interface PlannerContextResponse {
  readonly workspaceId: string | null;
  readonly workspaceName: string | null;
  readonly workspaceBrief: string | null;
  readonly projects: ReadonlyArray<PlannerContextProjectSummary>;
  readonly boards: ReadonlyArray<PlannerContextBoardSummary>;
  readonly agents: ReadonlyArray<PlannerContextAgentSummary>;
  readonly openTaskSummary: ReadonlyArray<PlannerContextTaskSummary>;
  readonly docs: ReadonlyArray<PlannerContextDocSummary>;
}

interface ReadPlannerContextDependencies {
  readonly readModelReader?: (vaultRoot: string) => Promise<VaultReadModel>;
  readonly resolveRoot?: () => string;
  readonly workspaceIdReader?: () => string | null;
  readonly preloadedReadModel?: VaultReadModel;
}

function normalizeWorkspaceBrief(body: string): string | null {
  const brief = body.trim();
  return brief.length > 0 ? brief : null;
}

function toPlannerContextResponse(readModel: VaultReadModel): PlannerContextResponse {
  const workspace = readModel.workspaces[0] ?? null;
  const tasksByColumnId = new Map<string, number>();

  for (const task of readModel.tasks) {
    tasksByColumnId.set(task.columnId, (tasksByColumnId.get(task.columnId) ?? 0) + 1);
  }

  return {
    workspaceId: workspace?.id ?? null,
    workspaceName: workspace?.name ?? null,
    workspaceBrief: workspace === null ? null : normalizeWorkspaceBrief(workspace.body),
    projects: readModel.projects.map((project) => ({
      id: project.id,
      name: project.name,
      boardIds: readModel.boards
        .filter((board) => board.projectId === project.id)
        .map((board) => board.id),
      codebases: project.codebases,
    })),
    boards: readModel.boards.map((board) => ({
      id: board.id,
      projectId: board.projectId,
      name: board.name,
      columns: readModel.columns
        .filter((column) => column.boardId === board.id)
        .map((column) => ({
          id: column.id,
          name: column.name,
          position: column.position,
          taskCount: tasksByColumnId.get(column.id) ?? 0,
        })),
    })),
    agents: readModel.agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      capabilities: agent.capabilities,
      roles: agent.roles,
      status: agent.status,
    })),
    openTaskSummary: readModel.tasks
      .filter((task) => task.status !== "done" && task.status !== "cancelled")
      .map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        boardId: task.boardId,
        columnId: task.columnId,
        assignee: task.assignee,
      })),
    docs: readModel.docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      doc_type: doc.docType,
      status: doc.status,
      updatedAt: doc.updatedAt,
    })),
  };
}

export async function readPlannerContext(
  dependencies: ReadPlannerContextDependencies = {},
  options: { agentId?: string | null; requestedRoles?: ReadonlyArray<string> } = {},
): Promise<PlannerContextResponse> {
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
    });
  }
  return toPlannerContextResponse({ ...filteredReadModel, docs: filteredDocs.allowed });
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const agent = String(query.agent ?? query.agent_id ?? "anonymous");
  const requestedRoles = typeof query.roles === "string" ? query.roles.split(",") : [];
  const response = await readPlannerContext({}, { agentId: typeof query.agent_id === "string" ? query.agent_id : null, requestedRoles });
  const responseTokens = countTokens(response);
  const { baselineTokens, savedTokens } = computeSaving("planner-context", responseTokens);
  recordTokenSaving({ timestamp: new Date().toISOString(), agent, endpoint: "planner-context", responseTokens, baselineTokens, savedTokens });
  return response;
});
