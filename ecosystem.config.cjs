/module.exports = {
  apps: [
    {
      name: 'relayhq-3000',
      cwd: './app',
      script: 'node_modules/nuxt/bin/nuxt.mjs',
      args: 'dev --port 3000',
      env: { NODE_ENV: 'development' }
    }
  ]
}
