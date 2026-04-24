import { defineEventHandler } from "h3";

import { sessionStore as defaultSessionStore, type ActiveSession, type SessionStore } from "../../services/session/store";

interface ReadActiveAgentsDependencies {
  readonly sessionStore?: SessionStore;
  readonly now?: () => Date;
}

export function readActiveAgents(
  dependencies: ReadActiveAgentsDependencies = {},
): ReadonlyArray<ActiveSession> {
  const sessionStore = dependencies.sessionStore ?? defaultSessionStore;
  const now = dependencies.now?.() ?? new Date();
  return sessionStore.getActiveSessions(now);
}

export default defineEventHandler(() => readActiveAgents());
