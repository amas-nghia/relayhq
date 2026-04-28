import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { filterVaultReadModelByWorkspaceId, type VaultReadModel } from "../../../models/read-model";
import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { normalizeConfiguredWorkspaceId, readConfiguredWorkspaceId, resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";
import { launchAgentSession, type LaunchAgentSessionResult } from "../../../services/agents/launch";

export interface AgentRunRequestBody {
  readonly taskId: string;
  readonly mode?: 'fresh' | 'resume';
  readonly surface?: 'background' | 'visible-terminal';
  readonly previousSessionId?: string | null;
}

export interface AgentRunResponse extends LaunchAgentSessionResult {}

interface RunAgentDependencies {
  readonly resolveRoot?: () => string;
  readonly readModelReader?: typeof readCanonicalVaultReadModel;
  readonly workspaceIdReader?: typeof readConfiguredWorkspaceId;
  readonly launchAgentSession?: typeof launchAgentSession;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findAgent(readModel: VaultReadModel, agentId: string) {
  return readModel.agents.find((entry) => entry.id === agentId || entry.aliases.includes(agentId));
}

export async function runAgentTask(
  agentId: string,
  body: AgentRunRequestBody,
  dependencies: RunAgentDependencies = {},
): Promise<AgentRunResponse> {
  if (agentId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "Agent id is required." });
  }

  if (body.taskId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "taskId is required." });
  }

  const resolveRoot = dependencies.resolveRoot ?? resolveVaultWorkspaceRoot;
  const readModelReader = dependencies.readModelReader ?? readCanonicalVaultReadModel;
  const workspaceIdReader = dependencies.workspaceIdReader ?? readConfiguredWorkspaceId;
  const runLaunchAgentSession = dependencies.launchAgentSession ?? launchAgentSession;
  const vaultRoot = resolveRoot();
  const readModel = await readModelReader(vaultRoot);
  const workspaceId = normalizeConfiguredWorkspaceId(workspaceIdReader(), readModel.workspaces);
  const filteredReadModel = workspaceId === null
    ? readModel
    : filterVaultReadModelByWorkspaceId(readModel, workspaceId);

  const agent = findAgent(filteredReadModel, agentId);
  if (agent === undefined) {
    throw createError({ statusCode: 404, statusMessage: `Agent ${agentId} was not found.` });
  }

  const task = filteredReadModel.tasks.find((entry) => entry.id === body.taskId);
  if (task === undefined) {
    throw createError({ statusCode: 404, statusMessage: `Task ${body.taskId} was not found.` });
  }

  if (task.assignee !== agent.id && !agent.aliases.includes(task.assignee)) {
    throw createError({ statusCode: 409, statusMessage: `Task ${task.id} is not assigned to agent ${agent.id}.` });
  }

  return await runLaunchAgentSession({
    agentId: agent.id,
    taskId: task.id,
    mode: body.mode,
    surface: body.surface,
    previousSessionId: body.previousSessionId ?? null,
    vaultRoot,
  });
}

export default defineEventHandler(async (event) => {
  const agentId = getRouterParam(event, "id") ?? "";
  const body = await readBody(event);

  if (!isPlainRecord(body)) {
    throw createError({ statusCode: 400, statusMessage: "taskId is required." });
  }

  return await runAgentTask(agentId, {
    taskId: typeof body.taskId === "string" ? body.taskId : "",
    ...(body.mode === "resume" ? { mode: "resume" as const } : body.mode === "fresh" ? { mode: "fresh" as const } : {}),
    ...(body.surface === "visible-terminal" ? { surface: "visible-terminal" as const } : body.surface === "background" ? { surface: "background" as const } : {}),
    ...(typeof body.previousSessionId === "string" ? { previousSessionId: body.previousSessionId } : {}),
  });
});
