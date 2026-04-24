module.exports = {
  apps: [
    {
      name: 'relayhq-api',
      cwd: './app',
      script: 'node_modules/nuxt/bin/nuxt.mjs',
      args: 'dev --port 4310 --host 0.0.0.0',
      env: { NODE_ENV: 'development' },
      max_restarts: 10,
    },
    {
      name: 'relayhq-web',
      cwd: './web',
      script: 'node_modules/vite/bin/vite.js',
      args: '--port 3001 --host 0.0.0.0',
      env: {
        NODE_ENV: 'development',
        VITE_API_BASE_URL: 'http://127.0.0.1:4310',
      },
      max_restarts: 10,
    },
  ]
}
