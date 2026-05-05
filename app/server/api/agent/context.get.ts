import { defineEventHandler, getQuery } from "h3";

import { filterVaultReadModelByWorkspaceId, type VaultReadModel } from "../../models/read-model";
import { filterDocsForAgent, resolveAgentDocumentAccessContext, writeDeniedDocAccessAudit } from "../../services/authz/doc-access";
import { getRelevantDocsForTask } from "../../services/authz/relevant-docs";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, readExposedVaultRoot, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";
import { countTokens, computeSaving, recordTokenSaving } from "../../services/metrics/tracker";
import { sessionStore as defaultSessionStore, type ActiveSession, type SessionStore } from "../../services/session/store";
import { loadInstalledSkills, matchInstalledSkills, type InstalledSkill } from "../../services/agents/skills";

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

export interface AgentContextSkill {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly content: string;
}

export interface AgentContextCodebrainDoc {
  readonly id: string;
  readonly title: string;
  readonly doc_type: string;
  readonly path: string;
  readonly summary: string;
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
  readonly codebrain: ReadonlyArray<AgentContextCodebrainDoc>;
  readonly skills: ReadonlyArray<AgentContextSkill>;
  readonly activeSessions: ReadonlyArray<ActiveSession>;
}

interface ReadAgentContextDependencies {
  readonly readModelReader?: (vaultRoot: string) => Promise<VaultReadModel>;
  readonly resolveRoot?: () => string;
  readonly workspaceIdReader?: () => string | null;
  readonly preloadedReadModel?: VaultReadModel;
  readonly sessionStore?: SessionStore;
  readonly now?: () => Date;
  readonly skillDir?: string;
}

const BOARD_COLUMN_LANES = new Set(["todo", "in-progress", "review", "done"]);
const CODEBRAIN_DOC_TYPES = new Set(["repo-map", "capability-map"]);

function normalizeColumnLane(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase().replace(/[_\s]+/g, "-") ?? "";
  return BOARD_COLUMN_LANES.has(normalized) ? normalized : null;
}

function laneFromColumnName(name: string): string | null {
  return normalizeColumnLane(name);
}

function laneFromTaskStatus(status: VaultReadModel["tasks"][number]["status"]): string | null {
  switch (status) {
    case "todo":
      return "todo";
    case "scheduled":
      return "todo";
    case "in-progress":
      return "in-progress";
    case "review":
    case "waiting-approval":
    case "blocked":
      return "review";
    case "done":
    case "cancelled":
      return "done";
    default:
      return normalizeColumnLane(status);
  }
}

function summarizeDoc(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, 180);
}

function getCodebrainDocs(readModel: VaultReadModel, task: VaultReadModel["tasks"][number] | null): ReadonlyArray<AgentContextCodebrainDoc> {
  if (task === null) return [];

  return readModel.docs
    .filter((doc) => doc.projectId === task.projectId)
    .filter((doc) => CODEBRAIN_DOC_TYPES.has(doc.docType))
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      doc_type: doc.docType,
      path: doc.sourcePath,
      summary: summarizeDoc(doc.body),
      score: (doc.docType === "repo-map" ? 30 : 20) + doc.tags.filter((tag) => task.tags.includes(tag)).length * 10,
    }))
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, 3)
    .map(({ score: _score, ...doc }) => doc);
}

function toAgentContextResponse(
  readModel: VaultReadModel,
  activeSessions: ReadonlyArray<ActiveSession>,
  agentId: string | null,
  skills: ReadonlyArray<InstalledSkill>,
  codebrain: ReadonlyArray<AgentContextCodebrainDoc>,
): AgentContextResponse {
  const workspace = readModel.workspaces[0] ?? null;
  const tasksByColumnId = new Map<string, number>();
  const exposedVaultRoot = readExposedVaultRoot();
  const columnsById = new Map(readModel.columns.map((column) => [column.id, column] as const));
  const boardColumnIdsByLane = new Map<string, string>();

  for (const column of readModel.columns) {
    const lane = laneFromColumnName(column.name) ?? normalizeColumnLane(column.id);
    if (lane !== null && !boardColumnIdsByLane.has(`${column.boardId}:${lane}`)) {
      boardColumnIdsByLane.set(`${column.boardId}:${lane}`, column.id);
    }
  }

  for (const task of readModel.tasks) {
    const directColumn = columnsById.get(task.columnId);
    const mappedColumnId = directColumn?.boardId === task.boardId
      ? directColumn.id
      : (() => {
          const lane = laneFromTaskStatus(task.status) ?? normalizeColumnLane(task.columnId);
          return lane === null ? null : boardColumnIdsByLane.get(`${task.boardId}:${lane}`) ?? null;
        })();

    if (mappedColumnId !== null) {
      tasksByColumnId.set(mappedColumnId, (tasksByColumnId.get(mappedColumnId) ?? 0) + 1);
    }
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
    codebrain,
    skills: skills.map((skill) => ({
      name: skill.name,
      version: skill.version,
      description: skill.description,
      content: skill.content,
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
  options: { agentId?: string | null; requestedRoles?: ReadonlyArray<string>; taskId?: string | null } = {},
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

  const installedSkills = await loadInstalledSkills(dependencies.skillDir);
  const selectedTask = options.taskId === undefined || options.taskId === null
    ? null
    : filteredReadModel.tasks.find((task) => task.id === options.taskId) ?? null;
  const agentRecord = options.agentId === null || options.agentId === undefined
    ? null
    : filteredReadModel.agents.find((agent) => agent.id === options.agentId) ?? null
  const matchedSkills = matchInstalledSkills({
    skills: installedSkills,
    task: selectedTask,
    agentPrimarySkillFile: agentRecord?.skillFile ?? null,
    agentSkillFiles: agentRecord?.skillFiles ?? [],
  });

  const codebrain = getCodebrainDocs({ ...filteredReadModel, docs: filteredDocs.allowed }, selectedTask);

  return toAgentContextResponse({ ...filteredReadModel, docs: filteredDocs.allowed }, sessionStore.getActiveSessions(now), options.agentId ?? null, matchedSkills, codebrain);
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const agent = String(query.agent ?? query.agent_id ?? "anonymous");
  const requestedRoles = typeof query.roles === "string" ? query.roles.split(",") : [];
  const response = await readAgentContext({}, { agentId: typeof query.agent_id === "string" ? query.agent_id : null, requestedRoles, taskId: typeof query.taskId === "string" ? query.taskId : null });
  const responseTokens = countTokens(response);
  const { baselineTokens, savedTokens } = computeSaving("context", responseTokens);
  recordTokenSaving({ timestamp: new Date().toISOString(), agent, endpoint: "context", responseTokens, baselineTokens, savedTokens });
  return response;
});
