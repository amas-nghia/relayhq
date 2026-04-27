import { defineEventHandler, getQuery } from 'h3'
import { getEntry, completeEntry, failEntry } from '../../../utils/oauth-state'

export default defineEventHandler(async (event) => {
  const { code, state } = getQuery(event) as { code?: string; state?: string }

  const closeHtml = (msg: string) =>
    `<!doctype html><html><head><title>RelayHQ</title></head><body style="font-family:monospace;padding:2rem;background:#1c1917;color:#f5f5f4">
    <p>${msg}</p><script>setTimeout(()=>window.close(),1500)</script></body></html>`

  if (!code || !state) {
    return closeHtml('Missing code or state — please retry.')
  }

  const entry = getEntry(state)
  if (!entry) {
    return closeHtml('State expired or unknown — please retry.')
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (!res.ok) {
      const text = await res.text()
      failEntry(state, `Exchange failed: ${text}`)
      return closeHtml('Failed to exchange code. Please retry.')
    }
    const data = await res.json() as { key?: string }
    if (!data.key) {
      failEntry(state, 'No key in response')
      return closeHtml('No key returned. Please retry.')
    }
    completeEntry(state, data.key)
    return closeHtml('✓ Connected to OpenRouter — you can close this tab.')
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    failEntry(state, msg)
    return closeHtml('Error during connection. Please retry.')
  }
})
