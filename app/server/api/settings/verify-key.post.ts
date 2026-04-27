import { defineEventHandler, readBody, createError } from 'h3'

export interface VerifyKeyRequest {
  provider: string
  apiKey: string
}

export interface VerifyKeyResponse {
  valid: boolean
  error?: string
  models?: string[]
}

async function verifyAnthropic(apiKey: string): Promise<VerifyKeyResponse> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 401) return { valid: false, error: 'Invalid API key' }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } }
    return { valid: false, error: body?.error?.message ?? `HTTP ${res.status}` }
  }
  return { valid: true, models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'] }
}

async function verifyOpenAI(apiKey: string): Promise<VerifyKeyResponse> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 401) return { valid: false, error: 'Invalid API key' }
  if (!res.ok) return { valid: false, error: `HTTP ${res.status}` }
  const body = await res.json() as { data?: Array<{ id: string }> }
  const models = body.data?.map(m => m.id).filter(id =>
    id.startsWith('gpt-4') || id.startsWith('gpt-3.5')
  ).slice(0, 8) ?? []
  return { valid: true, models }
}

async function verifyGoogle(apiKey: string): Promise<VerifyKeyResponse> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`,
    { signal: AbortSignal.timeout(10_000) },
  )
  if (res.status === 400 || res.status === 403) return { valid: false, error: 'Invalid API key' }
  if (!res.ok) return { valid: false, error: `HTTP ${res.status}` }
  const body = await res.json() as { models?: Array<{ name: string }> }
  const models = body.models?.map(m => m.name.split('/').pop()!).filter(Boolean).slice(0, 8) ?? []
  return { valid: true, models }
}

async function verifyOpenRouter(apiKey: string): Promise<VerifyKeyResponse> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 401) return { valid: false, error: 'Invalid API key' }
  if (!res.ok) return { valid: false, error: `HTTP ${res.status}` }
  const body = await res.json() as { data?: Array<{ id: string }> }
  const models = body.data?.map(m => m.id).slice(0, 8) ?? []
  return { valid: true, models }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<VerifyKeyRequest>(event)

  if (!body?.provider || typeof body.provider !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing provider' })
  }
  if (!body?.apiKey || typeof body.apiKey !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing apiKey' })
  }

  try {
    switch (body.provider) {
      case 'anthropic':   return await verifyAnthropic(body.apiKey)
      case 'openai':      return await verifyOpenAI(body.apiKey)
      case 'google':      return await verifyGoogle(body.apiKey)
      case 'openrouter':  return await verifyOpenRouter(body.apiKey)
      default:
        return { valid: false, error: `Unknown provider: ${body.provider}` } satisfies VerifyKeyResponse
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Verification failed'
    return { valid: false, error: msg } satisfies VerifyKeyResponse
  }
})
