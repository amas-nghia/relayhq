export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: true },
  runtimeConfig: {
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  },
  routeRules: {
    '/api/**': {
      cors: true,
      headers: {
        'access-control-allow-origin': process.env.CORS_ORIGIN || 'http://localhost:3001',
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'Content-Type, Authorization',
      },
    },
  },
})
