import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { appendAgentSessionEvent } from "../../../../services/agents/session-events";
import { agentRunnerManager } from "../../../../services/runners/manager";
import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";

interface SendSessionMessageDependencies {
  readonly getRunner?: typeof agentRunnerManager.getRunner
  readonly sendInput?: typeof agentRunnerManager.sendInput
  readonly appendEvent?: typeof appendAgentSessionEvent
  readonly resolveRoot?: typeof resolveVaultWorkspaceRoot
}

export async function sendSessionMessage(sessionId: string, body: unknown, dependencies: SendSessionMessageDependencies = {}) {
  const message = typeof (body as { message?: unknown })?.message === 'string' ? (body as { message: string }).message.trim() : ''
  if (message.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "message is required." })
  }

  const getRunner = dependencies.getRunner ?? agentRunnerManager.getRunner.bind(agentRunnerManager)
  const sendInput = dependencies.sendInput ?? agentRunnerManager.sendInput.bind(agentRunnerManager)
  const appendEvent = dependencies.appendEvent ?? appendAgentSessionEvent
  const resolveRoot = dependencies.resolveRoot ?? resolveVaultWorkspaceRoot

  const runner = getRunner(sessionId)
  if (!runner) {
    throw createError({ statusCode: 404, statusMessage: "Session not found." })
  }

  if (runner.launchSurface === 'visible-terminal' || runner.status === 'handed-off') {
    throw createError({ statusCode: 409, statusMessage: "Visible terminal sessions are detached from the web UI and do not accept chat input. Use a background session if you want in-app messaging." })
  }

  const result = sendInput(sessionId, message)
  if (!result) {
    throw createError({ statusCode: 409, statusMessage: "Session is not accepting input." })
  }

  const vaultRoot = resolveRoot()
  await appendEvent(vaultRoot, {
    sessionId,
    agentId: runner.agentName,
    taskId: runner.taskId ?? null,
    type: 'user.message',
    timestamp: new Date().toISOString(),
    text: message,
  })

  return result
}

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, "sessionId") ?? ""
  if (sessionId.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "sessionId is required." })
  }

  const body = await readBody(event)
  return await sendSessionMessage(sessionId, body)
})
