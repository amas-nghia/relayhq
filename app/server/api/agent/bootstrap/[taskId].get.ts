import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createError, defineEventHandler, getQuery, getRouterParam } from "h3";

import { filterVaultReadModelByWorkspaceId, type VaultReadModel } from "../../../models/read-model";
import { isExpensiveModel } from "../../../../shared/vault/schema";
import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";
import { countTokens, computeSaving, recordTokenSaving } from "../../../services/metrics/tracker";
import { loadInstalledSkills, matchInstalledSkills } from "../../../services/agents/skills";

const OBJECTIVE_CHAR_LIMIT = 500;
const RELATED_TASK_LIMIT = 5;
const INLINE_CONTEXT_FILE_CHAR_LIMIT = 4000;
const INLINE_CONTEXT_TOTAL_CHAR_LIMIT = 16000;

const PROTOCOL_INSTRUCTIONS = [
  "1. You already have this task claimed or are about to claim it. Call POST /api/vault/tasks/{taskId}/claim with your agentId before touching anything.",
  "2. Send a heartbeat every 10 minutes: POST /api/vault/tasks/{taskId}/heartbeat.",
  "3. If you need a human decision, call POST /api/vault/tasks/{taskId}/request-approval with a reason. Stop work until approved.",
  "4. When implementation is complete, call PATCH /api/vault/tasks/{taskId} with status=review, progress=100, result=<concrete outcome>.",
  "5. Do not write directly to vault files. All mutations go through the API.",
].join("\n");

export interface BootstrapTaskSummary {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly column: string;
  readonly priority: string;
  readonly assignee: string;
  readonly progress: number;
  readonly boardId: string;
  readonly projectId: string;
}

export interface BootstrapEntitySummary {
  readonly id: string;
  readonly name: string;
}

export interface BootstrapRelatedTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}

export interface BootstrapDependencyTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}

export interface BootstrapPendingApproval {
  readonly id: string;
  readonly reason: string | null;
  readonly requestedAt: string | null;
}

export interface BootstrapApprovalPolicy {
  readonly required: boolean;
  readonly reason: string | null;
}

export interface BootstrapSkill {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly content: string;
}

export interface BootstrapPack {
  readonly etag: string;
  readonly task: BootstrapTaskSummary;
  readonly workspace: BootstrapEntitySummary | null;
  readonly project: BootstrapEntitySummary | null;
  readonly board: BootstrapEntitySummary | null;
  readonly objective: string;
  readonly acceptanceCriteria: ReadonlyArray<string>;
  readonly constraints: ReadonlyArray<string>;
  readonly contextFiles: ReadonlyArray<string>;
  readonly contextFileContents: Readonly<Record<string, string>> | null;
  readonly dependsOn: ReadonlyArray<BootstrapDependencyTask>;
  readonly relatedTasks: ReadonlyArray<BootstrapRelatedTask>;
  readonly pendingApprovals: ReadonlyArray<BootstrapPendingApproval>;
  readonly protocolInstructions: string | null;
  readonly approvalPolicy: BootstrapApprovalPolicy;
  readonly skills: ReadonlyArray<BootstrapSkill>;
  /** Model the agent MUST use for this task. Set by agent registry — do not override. */
  readonly enforced_model: string | null;
  readonly expensive_model_warning: string | null;
}

export interface BootstrapUnchanged {
  readonly changed: false;
  readonly etag: string;
}

export function computeBootstrapEtag(task: { id: string; updatedAt: string; status: string; progress: number }): string {
  return `${task.id}:${task.updatedAt}:${task.status}:${task.progress}`;
}

interface ReadTaskBootstrapDependencies {
  readonly readModelReader?: (vaultRoot: string) => Promise<VaultReadModel>;
  readonly resolveRoot?: () => string;
  readonly workspaceIdReader?: () => string | null;
  readonly includeProtocol?: boolean;
  readonly inlineContextFiles?: boolean;
  readonly preloadedReadModel?: VaultReadModel;
  readonly agentId?: string | null;
  readonly skillDir?: string;
}

function isSafeContextFilePath(filePath: string): boolean {
  return !filePath.startsWith("/") && !filePath.includes("..");
}

async function readInlineContextFileContents(
  vaultRoot: string,
  contextFiles: ReadonlyArray<string>,
): Promise<Readonly<Record<string, string>>> {
  const contents: Record<string, string> = {};
  let remainingCharacters = INLINE_CONTEXT_TOTAL_CHAR_LIMIT;

  for (const contextFile of contextFiles) {
    if (remainingCharacters <= 0 || !isSafeContextFilePath(contextFile)) {
      continue;
    }

    let content: string;
    try {
      content = await readFile(join(vaultRoot, contextFile), "utf8");
    } catch {
      content = "[file not found]";
    }

    const cappedContent = content.slice(0, Math.min(INLINE_CONTEXT_FILE_CHAR_LIMIT, remainingCharacters));
    contents[contextFile] = cappedContent;
    remainingCharacters -= cappedContent.length;
  }

  return contents;
}

function normalizeBody(body: string): string {
  return body.replace(/\r\n?/g, "\n").trim();
}

function extractPreamble(body: string): string {
  const normalizedBody = normalizeBody(body);
  const firstHeading = normalizedBody.match(/^([\s\S]*?)(?=\n##\s)/);
  const preamble = (firstHeading ? firstHeading[1] : normalizedBody).trim();
  return preamble.length <= OBJECTIVE_CHAR_LIMIT ? preamble : preamble.slice(0, OBJECTIVE_CHAR_LIMIT);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readMarkdownSection(body: string, heading: string): string | null {
  const normalizedBody = normalizeBody(body);
  if (normalizedBody.length === 0) {
    return null;
  }

  const sectionPattern = new RegExp(`(?:^|\\n)##\\s+${escapeRegExp(heading)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i");
  const match = normalizedBody.match(sectionPattern);
  const content = match?.[1]?.trim();
  return content && content.length > 0 ? content : null;
}

function parseMarkdownListSection(body: string, heading: string): ReadonlyArray<string> {
  const section = readMarkdownSection(body, heading);
  if (section === null) {
    return [];
  }

  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[-*+]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
    .filter((line) => line.length > 0);
}

export async function readTaskBootstrapPack(
  taskId: string,
  dependencies: ReadTaskBootstrapDependencies = {},
): Promise<BootstrapPack> {
  const normalizedTaskId = taskId.trim();
  if (normalizedTaskId.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  const readModelReader = dependencies.readModelReader ?? readCanonicalVaultReadModel;
  const resolveRoot = dependencies.resolveRoot ?? resolveVaultWorkspaceRoot;
  const workspaceIdReader = dependencies.workspaceIdReader ?? readConfiguredWorkspaceId;
  const vaultRoot = resolveRoot();
  let filteredReadModel: VaultReadModel;
  if (dependencies.preloadedReadModel !== undefined) {
    filteredReadModel = dependencies.preloadedReadModel;
  } else {
    const readModel = await readModelReader(vaultRoot);
    const configuredWorkspaceId = normalizeConfiguredWorkspaceId(workspaceIdReader(), readModel.workspaces);
    filteredReadModel = configuredWorkspaceId === null
      ? readModel
      : filterVaultReadModelByWorkspaceId(readModel, configuredWorkspaceId);
  }

  const task = filteredReadModel.tasks.find((entry) => entry.id === normalizedTaskId);
  if (task === undefined) {
    throw createError({ statusCode: 404, statusMessage: `Task ${normalizedTaskId} was not found.` });
  }

  const etag = computeBootstrapEtag(task);

  const workspace = filteredReadModel.workspaces.find((entry) => entry.id === task.workspaceId) ?? null;
  const project = filteredReadModel.projects.find((entry) => entry.id === task.projectId) ?? null;
  const board = filteredReadModel.boards.find((entry) => entry.id === task.boardId) ?? null;

  const relatedTasks = filteredReadModel.tasks
    .filter((entry) => entry.boardId === task.boardId && entry.id !== task.id)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
    .slice(0, RELATED_TASK_LIMIT)
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      status: entry.status,
    }));

  const dependsOn = task.dependsOn
    .map((dependencyId) => filteredReadModel.tasks.find((entry) => entry.id === dependencyId))
    .filter((entry): entry is VaultReadModel["tasks"][number] => entry !== undefined)
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      status: entry.status,
    }));

  const pendingApprovals = filteredReadModel.approvals
    .filter((approval) => approval.taskId === task.id && approval.outcome === "pending")
    .sort((left, right) => (right.requestedAt ?? "").localeCompare(left.requestedAt ?? "") || left.id.localeCompare(right.id))
    .map((approval) => ({
      id: approval.id,
      reason: approval.reason,
      requestedAt: approval.requestedAt,
    }));

  const includeProtocol = dependencies.includeProtocol !== false;
  const contextFiles = parseMarkdownListSection(task.body, "Context Files");
  const contextFileContents = dependencies.inlineContextFiles === true
    ? await readInlineContextFileContents(vaultRoot, contextFiles)
    : null;
  const installedSkills = await loadInstalledSkills(dependencies.skillDir);
  const assignedAgent = task.assignee
    ? filteredReadModel.agents.find((agent) => agent.id === task.assignee) ?? null
    : null;
  const agentSkillFiles = dependencies.agentId === undefined || dependencies.agentId === null
    ? []
    : filteredReadModel.agents.find((agent) => agent.id === dependencies.agentId)?.skillFiles ?? [];
  const matchedSkills = matchInstalledSkills({ skills: installedSkills, task: { type: task.type, tags: task.tags }, agentSkillFiles });

  const enforcedModel = assignedAgent?.model ?? null;
  const expensiveModelWarning = enforcedModel !== null && isExpensiveModel(enforcedModel)
    ? `WARNING: This task is assigned to an agent using "${enforcedModel}", which is an expensive model. Consider re-registering the agent with claude-sonnet-4-6 for routine tasks to avoid excessive token costs.`
    : null;

  return {
    etag,
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      column: task.columnId,
      priority: task.priority,
      assignee: task.assignee,
      progress: task.progress,
      boardId: task.boardId,
      projectId: task.projectId,
    },
    workspace: workspace === null ? null : { id: workspace.id, name: workspace.name },
    project: project === null ? null : { id: project.id, name: project.name },
    board: board === null ? null : { id: board.id, name: board.name },
    objective: extractPreamble(task.body),
    acceptanceCriteria: parseMarkdownListSection(task.body, "Acceptance Criteria"),
    constraints: parseMarkdownListSection(task.body, "Constraints"),
    contextFiles,
    contextFileContents,
    dependsOn,
    relatedTasks,
    pendingApprovals,
    protocolInstructions: includeProtocol ? PROTOCOL_INSTRUCTIONS : null,
    approvalPolicy: {
      required: task.approvalNeeded,
      reason: task.approvalState.reason,
    },
    skills: matchedSkills.map((skill) => ({
      name: skill.name,
      version: skill.version,
      description: skill.description,
      content: skill.content,
    })),
    enforced_model: enforcedModel,
    expensive_model_warning: expensiveModelWarning,
  };
}

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, "taskId");
  if (!taskId) {
    throw createError({ statusCode: 400, statusMessage: "Task id is required." });
  }

  const query = getQuery(event);
  const agent = String(query.agent ?? "anonymous");
  const since = typeof query.since === "string" ? query.since : undefined;
  const includeProtocol = query.includeProtocol !== "false" && query.protocol !== "false";
  const inlineContextFiles = query.inline === "true";

  const pack = await readTaskBootstrapPack(taskId, { includeProtocol, inlineContextFiles, agentId: agent });

  if (since !== undefined && since === pack.etag) {
    return { changed: false, etag: pack.etag } satisfies BootstrapUnchanged;
  }

  const responseTokens = countTokens(pack);
  const { baselineTokens, savedTokens } = computeSaving("bootstrap", responseTokens);
  recordTokenSaving({ timestamp: new Date().toISOString(), agent, endpoint: "bootstrap", taskId, responseTokens, baselineTokens, savedTokens });
  return pack;
});
