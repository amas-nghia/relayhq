import { defineEventHandler, getQuery, getRouterParam } from "h3";

import { listRecordedAgentSessions } from "../../../services/agents/session-events";
import { listAgentTaskSessionRecords } from "../../../services/agents/session-registry";
import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";
import { agentRunnerManager } from "../../../services/runners/manager";

interface SessionListDependencies {
  readonly resolveRoot?: () => string;
  readonly readModelReader?: typeof readCanonicalVaultReadModel;
  readonly activeSessionsReader?: typeof agentRunnerManager.getAgentRunners;
  readonly recordedSessionsReader?: typeof listRecordedAgentSessions;
}

export async function listAgentSessions(agentId: string, options: { projectId?: string | null } = {}, dependencies: SessionListDependencies = {}) {
  const resolveRoot = dependencies.resolveRoot ?? resolveVaultWorkspaceRoot
  const readModelReader = dependencies.readModelReader ?? readCanonicalVaultReadModel
  const activeSessionsReader = dependencies.activeSessionsReader ?? agentRunnerManager.getAgentRunners.bind(agentRunnerManager)
  const recordedSessionsReader = dependencies.recordedSessionsReader ?? listRecordedAgentSessions

  const activeSessions = activeSessionsReader(agentId)
  const activeSessionIds = new Set(activeSessions.map((session) => session.sessionId))
  const vaultRoot = resolveRoot()
  const readModel = await readModelReader(vaultRoot)
  const agent = readModel.agents.find((entry) => entry.id === agentId || entry.aliases.includes(agentId)) ?? null
  const recordedSessions = await recordedSessionsReader(vaultRoot, agentId)

  // When projectId filter provided, build set of sessionIds that belong to this project
  let projectScopedSessionIds: Set<string> | null = null
  if (options.projectId) {
    const registryRecords = await listAgentTaskSessionRecords(vaultRoot)
    const projectSessionIds = registryRecords
      .filter((r) => r.agentId === agentId && r.projectId === options.projectId)
      .map((r) => r.sessionId)
    projectScopedSessionIds = new Set(projectSessionIds)
  }
  const seenSessionIds = new Set<string>()

  const normalizeRecordedStatus = (session: Awaited<ReturnType<typeof listRecordedAgentSessions>>[number]) => {
    if ((session.status === 'running' || session.status === 'handed-off') && !activeSessionIds.has(session.sessionId)) {
      return 'stopped' as const
    }
    return session.status
  }

  return [
    ...activeSessions,
    ...recordedSessions
      .filter((session) => !activeSessionIds.has(session.sessionId))
      .map((session) => ({
        id: session.sessionId,
        sessionId: session.sessionId,
        agentName: agent?.id ?? agentId,
        ...(session.taskId ? { taskId: session.taskId } : {}),
        provider: agent?.provider ?? 'unknown',
        runtimeKind: session.runtimeKind ?? agent?.runtimeKind ?? agent?.provider ?? 'unknown',
        launchSurface: 'background' as const,
        launchMode: session.launchMode,
        resumedFromSessionId: null,
        status: normalizeRecordedStatus(session),
        command: session.command ?? agent?.runCommand ?? agent?.runtimeKind ?? agent?.provider ?? 'unknown',
        cwd: null,
        startTime: session.startTime,
        lastEventAt: session.lastEventAt,
      })),
  ]
    .filter((session) => {
      if (seenSessionIds.has(session.sessionId)) return false
      seenSessionIds.add(session.sessionId)
      if (projectScopedSessionIds !== null && !projectScopedSessionIds.has(session.sessionId)) return false
      return true
    })
    .sort((left, right) => right.startTime.localeCompare(left.startTime))
}

export default defineEventHandler(async (event) => {
  const agentId = getRouterParam(event, "id") ?? "";
  const query = getQuery(event);
  const projectId = typeof query.projectId === "string" ? query.projectId : null;
  return await listAgentSessions(agentId, { projectId })
});
