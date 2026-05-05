import { createError, defineEventHandler, getQuery, getRouterParam } from "h3";

import { assertWorkPolicy } from "../../../services/policy/work-policy";
import { markAgentTaskSessionStopped } from "../../../services/agents/session-registry";
import { appendAgentSessionEvent } from "../../../services/agents/session-events";
import { agentRunnerManager } from "../../../services/runners/manager";
import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

export async function stopAgentSession(sessionId: string, actorId = "@relayhq-ui") {
  if (sessionId.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "sessionId is required." });
  }

  const runner = agentRunnerManager.getRunner(sessionId);
  if (!runner) {
    throw createError({ statusCode: 404, statusMessage: "Session not found or already stopped." });
  }

  const vaultRoot = resolveVaultWorkspaceRoot();
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  assertWorkPolicy({ actorId, action: "stop", readModel, sessionAgentId: runner.agentName })

  const success = agentRunnerManager.stopRunner(sessionId);
  if (!success) {
    throw createError({ statusCode: 404, statusMessage: "Session not found or already stopped." });
  }

  await appendAgentSessionEvent(vaultRoot, {
    sessionId,
    agentId: runner.agentName,
    taskId: runner.taskId ?? null,
    type: "session.stopped",
    timestamp: new Date().toISOString(),
    text: `Session stopped by ${actorId} from the desktop UI.`,
  });
  if (runner.taskId) {
    await markAgentTaskSessionStopped(vaultRoot, runner.agentName, runner.taskId, sessionId)
  }

  return { success: true, sessionId };
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const actorId = typeof query.actorId === "string" && query.actorId.trim().length > 0 ? query.actorId : "@relayhq-ui";
  return await stopAgentSession(getRouterParam(event, "sessionId") ?? "", actorId);
});
