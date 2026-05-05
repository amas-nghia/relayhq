import { defineEventHandler } from "h3";

import { agentRunnerManager, DEFAULT_RUNNER_STALE_AFTER_MS, isRunnerSessionLive, type AgentRunnerSummary } from "../../services/runners/manager";
import { sessionStore as defaultSessionStore, type ActiveSession, type SessionStore } from "../../services/session/store";

interface ReadActiveAgentsDependencies {
  readonly sessionStore?: SessionStore;
  readonly runnerReader?: () => ReadonlyArray<AgentRunnerSummary>;
  readonly now?: () => Date;
}

type LiveRuntimeSession = ActiveSession & {
  readonly agentId: string;
  readonly taskId?: string;
  readonly provider?: string;
  readonly runtimeKind?: string;
  readonly launchSurface?: 'background' | 'visible-terminal' | 'attached';
  readonly launchMode?: 'fresh' | 'resume' | 'attached';
  readonly resumedFromSessionId?: string | null;
  readonly status?: 'running' | 'handed-off' | 'attached';
  readonly command?: string;
  readonly cwd?: string | null;
  readonly pid?: number;
  readonly startTime?: string;
  readonly source: 'runner' | 'attached';
};

function isLiveRunnerSession(
  session: AgentRunnerSummary,
  nowMs: number,
): session is AgentRunnerSummary & { status: 'running' | 'handed-off' } {
  return isRunnerSessionLive(session, nowMs, DEFAULT_RUNNER_STALE_AFTER_MS);
}

export function readActiveAgents(
  dependencies: ReadActiveAgentsDependencies = {},
): ReadonlyArray<LiveRuntimeSession> {
  const sessionStore = dependencies.sessionStore ?? defaultSessionStore;
  const runnerReader = dependencies.runnerReader ?? agentRunnerManager.getRunners.bind(agentRunnerManager);
  const now = dependencies.now?.() ?? new Date();
  const nowMs = now.getTime();

  const runnerSessions = runnerReader()
    .filter((session) => isLiveRunnerSession(session, nowMs))
    .map((session) => ({
      sessionId: session.sessionId,
      agentId: session.agentName,
      agentName: session.agentName,
      lastSeenAt: session.lastEventAt,
      idleSeconds: Math.max(0, Math.floor((nowMs - Date.parse(session.lastEventAt)) / 1000)),
      ...(session.taskId ? { taskId: session.taskId } : {}),
      provider: session.provider,
      runtimeKind: session.runtimeKind,
      launchSurface: session.launchSurface,
      launchMode: session.launchMode,
      resumedFromSessionId: session.resumedFromSessionId,
      status: session.status,
      command: session.command,
      cwd: session.cwd,
      ...(session.pid === undefined ? {} : { pid: session.pid }),
      startTime: session.startTime,
      source: 'runner' as const,
    } satisfies LiveRuntimeSession));

  const attachedSessions = sessionStore.getActiveSessions(now).map((session) => ({
    ...session,
    agentId: session.agentName.replace(/#\d+$/, ''),
    launchSurface: 'attached' as const,
    launchMode: 'attached' as const,
    status: 'attached' as const,
    source: 'attached' as const,
  } satisfies LiveRuntimeSession));

  return [...runnerSessions, ...attachedSessions].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
}

export default defineEventHandler(() => readActiveAgents());
