import { defineEventHandler } from 'h3'
import { createEntry } from '../../../utils/oauth-state'

const CALLBACK_URL = 'http://127.0.0.1:44210/api/auth/openrouter/callback'

export default defineEventHandler(() => {
  const state = createEntry('openrouter')
  const authUrl = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(CALLBACK_URL)}&state=${state}`
  return { authUrl, state }
})
