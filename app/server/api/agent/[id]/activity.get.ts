import { createError, defineEventHandler, getRouterParam } from "h3";

import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

export async function readAgentActivity(agentId: string) {
  if (!agentId) {
    throw createError({ statusCode: 400, statusMessage: "Agent id is required." })
  }

  const model = await readCanonicalVaultReadModel(resolveVaultWorkspaceRoot())
  const events = model.auditNotes
    .filter(note => note.source === agentId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(note => {
      const task = model.tasks.find(entry => entry.id === note.taskId)
        const eventType = note.message.startsWith('session_start')
          ? 'session_start'
          : note.message.startsWith('heartbeat')
            ? 'heartbeat'
            : task?.status === 'review' || task?.status === 'done'
              ? 'task_completed'
              : note.message.includes('approval')
                ? 'approval_requested'
                : 'task_claimed'
      return {
        timestamp: note.createdAt,
        event_type: eventType,
        taskId: task?.id ?? null,
        tokens_used: task?.tokensUsed ?? null,
        model: task?.model ?? null,
      }
    })

  return events
}

export default defineEventHandler(async (event) => {
  return await readAgentActivity(getRouterParam(event, 'id') ?? '')
})
