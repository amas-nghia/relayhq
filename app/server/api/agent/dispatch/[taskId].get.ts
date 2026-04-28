import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'

import { evaluateTaskDispatch } from '../../../services/agents/dispatch'
import { readCanonicalVaultReadModel } from '../../../services/vault/read'
import { resolveVaultWorkspaceRoot } from '../../../services/vault/runtime'

export default defineEventHandler(async (event) => {
  const taskId = getRouterParam(event, 'taskId') ?? ''
  const query = getQuery(event)
  const agentId = typeof query.agentId === 'string' ? query.agentId.trim() : ''

  if (taskId.length === 0 || agentId.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'taskId and agentId are required.' })
  }

  const vaultRoot = resolveVaultWorkspaceRoot()
  const readModel = await readCanonicalVaultReadModel(vaultRoot)

  return evaluateTaskDispatch({
    readModel,
    taskId,
    agentId,
  })
})
