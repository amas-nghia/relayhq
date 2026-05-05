import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { appendAgentSessionEvent } from "../../../../services/agents/session-events";
import { launchAgentSession, type LaunchAgentSessionResult } from "../../../../services/agents/launch";
import { assertWorkPolicy, isCoordinatorAgent } from "../../../../services/agents/coordinator";
import { readCanonicalVaultReadModel } from "../../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";
import { agentRunnerManager, isRunnerSessionReusable, type AgentRunnerSummary } from "../../../../services/runners/manager";
import { listRecordedAgentSessions } from "../../../../services/agents/session-events";
import { bindAgentRuntime } from "../../agents/[id]/bind-runtime.post";
import { clearCoordinatorThreadActiveSession, openCoordinatorThread, setCoordinatorThreadActiveSession } from "../../../../services/vault/coordinator-thread";

export interface ProjectCoordinatorChatResponse extends LaunchAgentSessionResult {
  readonly projectId: string;
  readonly coordinatorAgentId: string;
  readonly coordinatorThreadId: string;
}

const coordinatorChatLaunches = new Map<string, Promise<ProjectCoordinatorChatResponse>>();

interface OpenCoordinatorChatDependencies {
  readonly resolveRoot?: () => string;
  readonly readModelReader?: typeof readCanonicalVaultReadModel;
  readonly openThread?: typeof openCoordinatorThread;
  readonly setThreadActiveSession?: typeof setCoordinatorThreadActiveSession;
  readonly clearThreadActiveSession?: typeof clearCoordinatorThreadActiveSession;
  readonly sendInput?: typeof agentRunnerManager.sendInput;
  readonly launchSession?: typeof launchAgentSession;
  readonly activeSessionsReader?: typeof agentRunnerManager.getAgentRunners;
  readonly recordedSessionsReader?: typeof listRecordedAgentSessions;
  readonly bindRuntime?: typeof bindAgentRuntime;
}

interface OpenCoordinatorChatRequestBody {
  readonly message?: string | null;
  readonly mode?: 'fresh' | 'resume' | 'reset' | null;
}

function isCoordinatorChatDependencies(value: unknown): value is OpenCoordinatorChatDependencies {
  return typeof value === 'object' && value !== null && (
    'resolveRoot' in value
    || 'readModelReader' in value
    || 'openThread' in value
    || 'setThreadActiveSession' in value
    || 'clearThreadActiveSession' in value
    || 'sendInput' in value
    || 'launchSession' in value
    || 'activeSessionsReader' in value
    || 'recordedSessionsReader' in value
    || 'bindRuntime' in value
  )
}

function defaultCoordinatorRuntime(provider: string | null): string {
  if (provider === "claude" || provider === "anthropic") return "claude-code";
  if (provider === "codex") return "codex";
  return "opencode";
}

function needsRuntimeBinding(agent: { runtimeKind?: string | null; commandTemplate?: string | null; runCommand?: string | null }) {
  return !agent.runtimeKind && !agent.commandTemplate && !agent.runCommand;
}

function activeCoordinatorChatResponse(
  projectId: string,
  coordinatorAgentId: string,
  coordinatorThreadId: string,
  session: ReturnType<typeof agentRunnerManager.getAgentRunners>[number],
): ProjectCoordinatorChatResponse {
  return {
    agentId: coordinatorAgentId,
    taskId: coordinatorThreadId,
    coordinatorThreadId,
    sessionId: session.sessionId,
    runnerId: session.id,
    runtimeKind: session.runtimeKind,
    launchSurface: session.launchSurface,
    launchMode: session.launchMode,
    command: session.command,
    args: [],
    projectId,
    coordinatorAgentId,
  };
}

function resolveReusableCoordinatorSession(
  sessions: ReadonlyArray<AgentRunnerSummary>,
  coordinatorThreadId: string,
  activeSessionId: string | null,
): AgentRunnerSummary | null {
  const reusableSessions = sessions.filter((session) => isRunnerSessionReusable(session))
  if (activeSessionId) {
    const exact = reusableSessions.find((session) => session.sessionId === activeSessionId)
    if (exact) return exact
  }

  return reusableSessions.find((session) => session.taskId === coordinatorThreadId) ?? null
}

export async function openProjectCoordinatorChat(
  projectId: string,
  bodyOrDependencies: OpenCoordinatorChatRequestBody | OpenCoordinatorChatDependencies = {},
  dependencies: OpenCoordinatorChatDependencies = {},
): Promise<ProjectCoordinatorChatResponse> {
  if (projectId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "projectId is required." });
  }

  const requestBody = isCoordinatorChatDependencies(bodyOrDependencies) ? {} : bodyOrDependencies
  const resolvedDependencies = isCoordinatorChatDependencies(bodyOrDependencies) ? bodyOrDependencies : dependencies

  const resolveRoot = resolvedDependencies.resolveRoot ?? resolveVaultWorkspaceRoot;
  const readModelReader = resolvedDependencies.readModelReader ?? readCanonicalVaultReadModel;
  const ensureThread = resolvedDependencies.openThread ?? openCoordinatorThread;
  const setThreadSession = resolvedDependencies.setThreadActiveSession ?? setCoordinatorThreadActiveSession;
  const clearThreadSession = resolvedDependencies.clearThreadActiveSession ?? clearCoordinatorThreadActiveSession;
  const sendInput = resolvedDependencies.sendInput ?? agentRunnerManager.sendInput.bind(agentRunnerManager);
  const launchSession = resolvedDependencies.launchSession ?? launchAgentSession;
  const activeSessionsReader = resolvedDependencies.activeSessionsReader ?? agentRunnerManager.getAgentRunners.bind(agentRunnerManager);
  const recordedSessionsReader = resolvedDependencies.recordedSessionsReader ?? listRecordedAgentSessions;
  const bindRuntime = resolvedDependencies.bindRuntime ?? bindAgentRuntime;
  const requestedMessage = requestBody.message?.trim() ?? ""
  const requestedMode = requestBody.mode ?? null

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
  assertWorkPolicy({ actorId: coordinator.id, actorIntent: "agent", action: "coordinate", readModel })

  const thread = await ensureThread({ vaultRoot, projectId: project.id, coordinatorAgentId: coordinator.id });
  const coordinatorThreadId = thread.frontmatter.id;

  const activeSession = resolveReusableCoordinatorSession(
    activeSessionsReader(coordinator.id),
    coordinatorThreadId,
    thread.frontmatter.active_session_id,
  )
  console.info('[RelayHQ][coordinator-chat] resolve', {
    projectId,
    coordinatorAgentId: coordinator.id,
    coordinatorThreadId,
    requestedMode,
    requestedMessageLength: requestedMessage.length,
    threadActiveSessionId: thread.frontmatter.active_session_id,
    activeSessionId: activeSession?.sessionId ?? null,
    activeSessionStatus: activeSession?.status ?? null,
  })
  if (activeSession && requestedMessage.length === 0 && requestedMode !== 'fresh' && requestedMode !== 'reset') {
    if (thread.frontmatter.active_session_id !== activeSession.sessionId) {
      await setThreadSession(thread.filePath, activeSession.sessionId)
    }
    return activeCoordinatorChatResponse(project.id, coordinator.id, coordinatorThreadId, activeSession);
  }

  const key = [vaultRoot, project.id, coordinator.id, coordinatorThreadId].join("\0");
  const pending = coordinatorChatLaunches.get(key);
  if (pending) return await pending;

  const launched = (async () => {
    const activeSession = resolveReusableCoordinatorSession(
      activeSessionsReader(coordinator.id),
      coordinatorThreadId,
      thread.frontmatter.active_session_id,
    )
    if (activeSession && requestedMessage.length === 0 && requestedMode !== 'fresh' && requestedMode !== 'reset') {
      if (thread.frontmatter.active_session_id !== activeSession.sessionId) {
        await setThreadSession(thread.filePath, activeSession.sessionId)
      }
      return activeCoordinatorChatResponse(project.id, coordinator.id, coordinatorThreadId, activeSession);
    }

    if (requestedMessage.length > 0 && activeSession && requestedMode !== 'fresh' && requestedMode !== 'reset') {
      if (thread.frontmatter.active_session_id !== activeSession.sessionId) {
        await setThreadSession(thread.filePath, activeSession.sessionId)
      }

      const sent = sendInput(activeSession.sessionId, requestedMessage)
      if (!sent) {
        throw createError({ statusCode: 409, statusMessage: 'Coordinator session is not accepting input.' })
      }

      await appendAgentSessionEvent(vaultRoot, {
        sessionId: activeSession.sessionId,
        agentId: coordinator.id,
        taskId: coordinatorThreadId,
        type: 'user.message',
        timestamp: new Date().toISOString(),
        text: requestedMessage,
      })

      return activeCoordinatorChatResponse(project.id, coordinator.id, coordinatorThreadId, activeSession);
    }

    if (activeSession && (requestedMode === 'fresh' || requestedMode === 'reset')) {
      console.info('[RelayHQ][coordinator-chat] stopping active session for fresh launch', {
        sessionId: activeSession.sessionId,
        status: activeSession.status,
        threadActiveSessionId: thread.frontmatter.active_session_id,
      })
      agentRunnerManager.stopRunner(activeSession.sessionId, requestedMode === 'reset'
        ? 'Resetting coordinator session.'
        : 'Starting a fresh coordinator session with updated settings.')
    }

    const recordedSession = thread.frontmatter.active_session_id
      ? (() => recordedSessionsReader(vaultRoot, coordinator.id))()
          .then((recordedSessions) => recordedSessions.find((session) => session.sessionId === thread.frontmatter.active_session_id) ?? null)
      : Promise.resolve(null)

    if (needsRuntimeBinding(coordinator)) {
      await bindRuntime(coordinator.id, { runtime: defaultCoordinatorRuntime(coordinator.provider) });
    }

    if (requestedMode === 'reset') {
      await clearThreadSession(thread.filePath)
    }

    const previousRecordedSession = await recordedSession
    const launchMode = requestedMode === 'resume' && previousRecordedSession ? 'resume' : 'fresh'
    const launched = await launchSession({
      agentId: coordinator.id,
      taskId: coordinatorThreadId,
      coordinatorThreadId,
      mode: launchMode,
      surface: "background",
      previousSessionId: launchMode === 'fresh' ? null : (activeSession?.sessionId ?? previousRecordedSession?.sessionId ?? null),
      userMessage: requestedMessage.length > 0 ? requestedMessage : null,
      vaultRoot,
    });
    console.info('[RelayHQ][coordinator-chat] launched', {
      sessionId: launched.sessionId,
      launchMode,
      previousSessionId: launchMode === 'fresh' ? null : (activeSession?.sessionId ?? previousRecordedSession?.sessionId ?? null),
      requestedMessageLength: requestedMessage.length,
    })
    await setThreadSession(thread.filePath, launched.sessionId);

    if (requestedMessage.length > 0) {
      await appendAgentSessionEvent(vaultRoot, {
        sessionId: launched.sessionId,
        agentId: coordinator.id,
        taskId: coordinatorThreadId,
        type: 'user.message',
        timestamp: new Date().toISOString(),
        text: requestedMessage,
      })
    }

    return {
      ...launched,
      projectId: project.id,
      coordinatorAgentId: coordinator.id,
      coordinatorThreadId,
    };
  })().finally(() => {
    coordinatorChatLaunches.delete(key);
  });
  coordinatorChatLaunches.set(key, launched);
  return await launched;
}

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, "id") ?? "";
  const body = await readBody(event).catch(() => ({}))
  return await openProjectCoordinatorChat(projectId, typeof body === 'object' && body !== null ? body as OpenCoordinatorChatRequestBody : {});
});
