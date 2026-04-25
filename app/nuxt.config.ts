export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: true },
  runtimeConfig: {},
  routeRules: {
    '/api/**': {
      cors: true,
      headers: {
        'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || 'http://localhost:44211',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
    },
  },
})
