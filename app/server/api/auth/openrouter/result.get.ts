import { defineEventHandler, getQuery, createError } from 'h3'
import { getEntry } from '../../../utils/oauth-state'

export function readOpenRouterAuthResult(state: string | undefined, entryReader: typeof getEntry = getEntry) {
  if (!state) throw createError({ statusCode: 400, statusMessage: 'Missing state' })

  const entry = entryReader(state)
  if (!entry) return { status: 'expired' as const }

  return {
    status: entry.status,
    apiKey: entry.apiKey,
    error: entry.error,
  }
}

export default defineEventHandler((event) => {
  const { state } = getQuery(event) as { state?: string }
  return readOpenRouterAuthResult(state)
})
