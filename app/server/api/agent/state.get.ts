import { defineEventHandler, getQuery } from "h3";

import { filterVaultReadModelByWorkspaceId, type VaultReadModel } from "../../models/read-model";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, resolveVaultWorkspaceRoot, validateVaultWorkspaceRoot } from "../../services/vault/runtime";

const PRIORITY_ORDER = new Map<string, number>([["critical", 0], ["high", 1], ["medium", 2], ["low", 3]]);

export interface AgentStateTaskSummary {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly assignee: string | null;
  readonly boardId: string;
  readonly columnId: string;
  readonly progress: number;
  readonly resumeHint: string | null;
  readonly pooled?: boolean;
}

export interface AgentStateHealth {
  readonly vaultOk: boolean;
  readonly vaultRoot: string;
  readonly reason: string | null;
}

export interface AgentStateResponse {
  readonly agentId: string;
  readonly aliases: ReadonlyArray<string>;
  readonly health: AgentStateHealth;
  readonly active: AgentStateTaskSummary | null;
  readonly inbox: ReadonlyArray<AgentStateTaskSummary>;
  readonly pool: ReadonlyArray<AgentStateTaskSummary>;
}

function normalizeAgentIds(agentId: string, aliases: ReadonlyArray<string>): ReadonlySet<string> {
  return new Set([agentId, ...aliases.map((alias) => alias.trim()).filter((alias) => alias.length > 0)]);
}

function compareByPriority(left: VaultReadModel["tasks"][number], right: VaultReadModel["tasks"][number]): number {
  return (PRIORITY_ORDER.get(left.priority) ?? 99) - (PRIORITY_ORDER.get(right.priority) ?? 99)
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id);
}

function toSummary(task: VaultReadModel["tasks"][number], extras: { readonly pooled?: boolean } = {}): AgentStateTaskSummary {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee.trim().length > 0 ? task.assignee : null,
    boardId: task.boardId,
    columnId: task.columnId,
    progress: task.progress,
    resumeHint: task.executionNotes ?? null,
    ...(extras.pooled === undefined ? {} : { pooled: extras.pooled }),
  };
}

function findAgentAliases(readModel: VaultReadModel, agentId: string): ReadonlyArray<string> {
  const agent = readModel.agents.find((entry) => entry.id === agentId || entry.aliases.includes(agentId));
  return agent === undefined ? [] : agent.aliases;
}

export function readAgentState(
  agentId: string,
  dependencies: {
    readonly resolveRoot?: () => string;
    readonly readModelReader?: typeof readCanonicalVaultReadModel;
    readonly workspaceIdReader?: typeof readConfiguredWorkspaceId;
  } = {},
): Promise<AgentStateResponse> {
  const resolveRoot = dependencies.resolveRoot ?? resolveVaultWorkspaceRoot;
  const readModelReader = dependencies.readModelReader ?? readCanonicalVaultReadModel;
  const workspaceIdReader = dependencies.workspaceIdReader ?? readConfiguredWorkspaceId;
  const vaultRoot = resolveRoot();

  return (async () => {
    const healthCheck = await validateVaultWorkspaceRoot(vaultRoot);
    if (!healthCheck.valid) {
      return {
        agentId,
        aliases: [],
        health: { vaultOk: false, vaultRoot, reason: healthCheck.reason },
        active: null,
        inbox: [],
        pool: [],
      };
    }

    try {
      const readModel = await readModelReader(vaultRoot);
      const workspaceId = normalizeConfiguredWorkspaceId(workspaceIdReader(), readModel.workspaces);
      const filteredReadModel = workspaceId === null
        ? readModel
        : filterVaultReadModelByWorkspaceId(readModel, workspaceId);
      const aliases = findAgentAliases(filteredReadModel, agentId);
      const agentIds = normalizeAgentIds(agentId, aliases);

      const matchingTasks = filteredReadModel.tasks.filter((task) => agentIds.has(task.assignee));
      const activeTask = matchingTasks.find((task) => task.status === "in-progress" && agentIds.has(task.lockedBy ?? "")) ?? null;
      const inbox = matchingTasks
        .filter((task) => task.status === "todo" && (task.lockedBy === null || task.lockedBy.length === 0))
        .sort(compareByPriority)
        .map((task) => toSummary(task));
      const pool = filteredReadModel.tasks
        .filter((task) => task.status === "todo" && task.assignee.trim().length === 0 && (task.lockedBy === null || task.lockedBy.length === 0))
        .sort(compareByPriority)
        .map((task) => toSummary(task, { pooled: true }));

      return {
        agentId,
        aliases,
        health: { vaultOk: true, vaultRoot, reason: null },
        active: activeTask === null ? null : toSummary(activeTask),
        inbox,
        pool,
      };
    } catch (error) {
      return {
        agentId,
        aliases: [],
        health: { vaultOk: false, vaultRoot, reason: error instanceof Error ? error.message : "Unable to read vault." },
        active: null,
        inbox: [],
        pool: [],
      };
    }
  })();
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const agentId = typeof query.agentId === "string" && query.agentId.trim().length > 0
    ? query.agentId.trim()
    : typeof query.agent_id === "string" && query.agent_id.trim().length > 0
      ? query.agent_id.trim()
      : "anonymous";

  return await readAgentState(agentId);
});
