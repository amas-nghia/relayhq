import { defineEventHandler, getHeader, setHeader, setResponseStatus } from 'h3'

function readAllowedOrigins(): ReadonlySet<string> {
  const raw = process.env.CORS_ORIGIN || 'http://localhost:3001,http://127.0.0.1:3001'
  return new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))
}

export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) {
    return
  }

  const origin = getHeader(event, 'origin')
  const allowedOrigins = readAllowedOrigins()

  if (origin && allowedOrigins.has(origin)) {
    setHeader(event, 'access-control-allow-origin', origin)
    setHeader(event, 'vary', 'Origin')
  }

  setHeader(event, 'access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  setHeader(event, 'access-control-allow-headers', 'Content-Type, Authorization')

  if (event.method === 'OPTIONS') {
    setResponseStatus(event, 204)
    return ''
  }
})
