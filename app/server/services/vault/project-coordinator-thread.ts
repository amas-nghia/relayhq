import { createError } from "h3";

import type { ReadModelCoordinatorThread } from "../../models/read-model";
import { isCoordinatorAgent } from "../agents/coordinator";
import { openCoordinatorThread, type CoordinatorThreadOpenResult } from "./coordinator-thread";
import { readCanonicalVaultReadModel } from "./read";
import { resolveVaultWorkspaceRoot } from "./runtime";

export interface ProjectCoordinatorThreadResponse {
  readonly thread: ReadModelCoordinatorThread;
  readonly created: boolean;
}

interface ProjectCoordinatorThreadDependencies {
  readonly resolveRoot?: () => string;
  readonly readModelReader?: typeof readCanonicalVaultReadModel;
  readonly openThread?: typeof openCoordinatorThread;
}

function toReadModelThread(result: CoordinatorThreadOpenResult): ReadModelCoordinatorThread {
  return {
    id: result.frontmatter.id,
    type: "coordinator-thread",
    workspaceId: result.frontmatter.workspace_id,
    projectId: result.frontmatter.project_id,
    coordinatorAgentId: result.frontmatter.coordinator_agent_id,
    activeSessionId: result.frontmatter.active_session_id,
    status: result.frontmatter.status,
    createdAt: result.frontmatter.created_at,
    updatedAt: result.frontmatter.updated_at,
    body: result.body,
    sourcePath: result.sourcePath,
  };
}

export async function getProjectCoordinatorThread(
  projectId: string,
  dependencies: ProjectCoordinatorThreadDependencies = {},
): Promise<ProjectCoordinatorThreadResponse | null> {
  if (projectId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "projectId is required." });
  }

  const vaultRoot = (dependencies.resolveRoot ?? resolveVaultWorkspaceRoot)();
  const readModel = await (dependencies.readModelReader ?? readCanonicalVaultReadModel)(vaultRoot);
  const project = readModel.projects.find((entry) => entry.id === projectId) ?? null;
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: `Project ${projectId} was not found.` });
  }

  const thread = (readModel.coordinatorThreads ?? []).find((entry) => entry.projectId === project.id && entry.status === "active") ?? null;
  return thread ? { thread, created: false } : null;
}

export async function openProjectCoordinatorThread(
  projectId: string,
  dependencies: ProjectCoordinatorThreadDependencies = {},
): Promise<ProjectCoordinatorThreadResponse> {
  if (projectId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "projectId is required." });
  }

  const resolveRoot = dependencies.resolveRoot ?? resolveVaultWorkspaceRoot;
  const readModelReader = dependencies.readModelReader ?? readCanonicalVaultReadModel;
  const openThread = dependencies.openThread ?? openCoordinatorThread;
  const vaultRoot = resolveRoot();
  const readModel = await readModelReader(vaultRoot);
  const project = readModel.projects.find((entry) => entry.id === projectId) ?? null;

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: `Project ${projectId} was not found.` });
  }

  const coordinatorAgentId = project.coordinatorAgentId ?? null;
  if (!coordinatorAgentId) {
    throw createError({ statusCode: 409, statusMessage: `Project ${project.name} does not have a coordinator assigned.` });
  }

  const coordinator = readModel.agents.find((entry) => entry.id === coordinatorAgentId || entry.aliases.includes(coordinatorAgentId)) ?? null;
  if (!coordinator) {
    throw createError({ statusCode: 404, statusMessage: `Coordinator agent ${coordinatorAgentId} was not found.` });
  }
  if (!isCoordinatorAgent(coordinator)) {
    throw createError({ statusCode: 409, statusMessage: `Agent ${coordinatorAgentId} is not registered with the coordinator role.` });
  }

  const opened = await openThread({ vaultRoot, projectId: project.id, coordinatorAgentId: coordinator.id });
  return { thread: toReadModelThread(opened), created: opened.created };
}
