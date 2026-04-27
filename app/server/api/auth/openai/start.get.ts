import { defineEventHandler, createError } from 'h3'
import { createHash, randomBytes } from 'node:crypto'
import { createEntry } from '../../../utils/oauth-state'
import { startOpenAICallbackServer } from '../../../utils/openai-callback-server'

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const REDIRECT_URI = 'http://localhost:1455/auth/callback'

export default defineEventHandler(async () => {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const state = createEntry('openai', codeVerifier)

  try {
    await startOpenAICallbackServer(state, codeVerifier)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to start callback server'
    throw createError({ statusCode: 500, statusMessage: msg })
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid profile email offline_access',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: 'relayhq',
  })

  return { authUrl: `https://auth.openai.com/oauth/authorize?${params}`, state }
})
