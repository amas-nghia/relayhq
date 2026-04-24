export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: true },
  runtimeConfig: {
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001,http://127.0.0.1:3001',
  },
  routeRules: {
    '/api/**': {
      cors: true,
    },
  },
})
