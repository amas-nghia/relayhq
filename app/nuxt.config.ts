export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: true },
  runtimeConfig: {
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:44211,http://127.0.0.1:44211',
  },
  routeRules: {
    '/api/**': {
      cors: true,
    },
  },
})
