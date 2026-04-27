import { randomBytes } from 'node:crypto'

export interface OAuthEntry {
  provider: string
  codeVerifier?: string
  status: 'pending' | 'complete' | 'error'
  apiKey?: string
  error?: string
  createdAt: number
}

// In-memory store — ephemeral, one process only
const store = new Map<string, OAuthEntry>()

const TTL_MS = 10 * 60 * 1000 // 10 min

export function createEntry(provider: string, codeVerifier?: string): string {
  const state = randomBytes(24).toString('base64url')
  store.set(state, { provider, codeVerifier, status: 'pending', createdAt: Date.now() })
  pruneExpired()
  return state
}

export function getEntry(state: string): OAuthEntry | undefined {
  const entry = store.get(state)
  if (!entry) return undefined
  if (Date.now() - entry.createdAt > TTL_MS) { store.delete(state); return undefined }
  return entry
}

export function completeEntry(state: string, apiKey: string): void {
  const entry = store.get(state)
  if (entry) store.set(state, { ...entry, status: 'complete', apiKey })
}

export function failEntry(state: string, error: string): void {
  const entry = store.get(state)
  if (entry) store.set(state, { ...entry, status: 'error', error })
}

function pruneExpired() {
  const now = Date.now()
  for (const [k, v] of store) {
    if (now - v.createdAt > TTL_MS) store.delete(k)
  }
}
