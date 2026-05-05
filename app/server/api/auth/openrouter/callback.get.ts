import { defineEventHandler, getQuery } from 'h3'
import { getEntry, completeEntry, failEntry } from '../../../utils/oauth-state'

export function renderCloseHtml(msg: string) {
  return `<!doctype html><html><head><title>RelayHQ</title></head><body style="font-family:monospace;padding:2rem;background:#1c1917;color:#f5f5f4">
    <p>${msg}</p><script>setTimeout(()=>window.close(),1500)</script></body></html>`
}

export async function handleOpenRouterCallback(
  query: { code?: string; state?: string },
  deps: {
    readonly entryReader?: typeof getEntry
    readonly completeEntryImpl?: typeof completeEntry
    readonly failEntryImpl?: typeof failEntry
    readonly fetchImpl?: typeof fetch
  } = {},
) {
  const { code, state } = query
  const entryReader = deps.entryReader ?? getEntry
  const completeEntryImpl = deps.completeEntryImpl ?? completeEntry
  const failEntryImpl = deps.failEntryImpl ?? failEntry
  const fetchImpl = deps.fetchImpl ?? fetch

  if (!code || !state) {
    return renderCloseHtml('Missing code or state — please retry.')
  }

  const entry = entryReader(state)
  if (!entry) {
    return renderCloseHtml('State expired or unknown — please retry.')
  }

  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (!res.ok) {
      const text = await res.text()
      failEntryImpl(state, `Exchange failed: ${text}`)
      return renderCloseHtml('Failed to exchange code. Please retry.')
    }
    const data = await res.json() as { key?: string }
    if (!data.key) {
      failEntryImpl(state, 'No key in response')
      return renderCloseHtml('No key returned. Please retry.')
    }
    completeEntryImpl(state, data.key)
    return renderCloseHtml('✓ Connected to OpenRouter — you can close this tab.')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    failEntryImpl(state, msg)
    return renderCloseHtml('Error during connection. Please retry.')
  }
}

export default defineEventHandler(async (event) => {
  const { code, state } = getQuery(event) as { code?: string; state?: string }
  return await handleOpenRouterCallback({ code, state })
})
