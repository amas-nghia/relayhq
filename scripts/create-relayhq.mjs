#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const templateRoot = resolve(__dirname, '..')

function fail(message) {
  console.error(`create-relayhq: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const flags = new Set(argv.filter(arg => arg.startsWith('--')))
  const positional = argv.filter(arg => !arg.startsWith('--'))
  if (positional.length === 0) {
    fail('usage: npx create-relayhq <folder> [--skip-install] [--skip-pm2] [--no-open]')
  }

  return {
    targetDir: resolve(process.cwd(), positional[0]),
    skipInstall: flags.has('--skip-install'),
    skipPm2: flags.has('--skip-pm2'),
    noOpen: flags.has('--no-open'),
  }
}

function ensureNodeVersion() {
  const major = Number(process.versions.node.split('.')[0])
  if (Number.isNaN(major) || major < 18) {
    fail(`Node.js 18+ is required. Current version: ${process.versions.node}`)
  }
}

function ensureBun() {
  const result = spawnSync('bun', ['--version'], { stdio: 'ignore' })
  if (result.status !== 0) {
    fail('Bun is required. Install it from https://bun.sh before running create-relayhq.')
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  })

  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 1}`)
  }
}

function copyTemplate(targetDir) {
  if (existsSync(targetDir)) {
    fail(`target directory already exists: ${targetDir}`)
  }

  mkdirSync(targetDir, { recursive: true })
  for (const entry of ['app', 'web', 'backend', 'cli', 'docs', 'vault', 'ecosystem.config.cjs', 'CLAUDE.md', 'README.md', 'package.json']) {
    cpSync(join(templateRoot, entry), join(targetDir, entry), { recursive: true })
  }
}

function installDependencies(targetDir) {
  run('bun', ['install'], { cwd: join(targetDir, 'app') })
  run('bun', ['install'], { cwd: join(targetDir, 'web') })
}

function startPm2(targetDir) {
  run('npx', ['pm2', 'start', 'ecosystem.config.cjs'], { cwd: targetDir })
  run('npx', ['pm2', 'save'], { cwd: targetDir })
}

function openBrowser(url) {
  const platform = process.platform
  if (platform === 'darwin') {
    execFileSync('open', [url])
    return
  }
  if (platform === 'win32') {
    execFileSync('cmd', ['/c', 'start', '', url])
    return
  }
  execFileSync('xdg-open', [url])
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  ensureNodeVersion()
  if (!options.skipInstall) ensureBun()

  console.log('[1/4] Copying RelayHQ template...')
  copyTemplate(options.targetDir)

  if (!options.skipInstall) {
    console.log('[2/4] Installing app and web dependencies with Bun...')
    installDependencies(options.targetDir)
  }

  if (!options.skipPm2) {
    console.log('[3/4] Starting RelayHQ with PM2...')
    startPm2(options.targetDir)
  }

  if (!options.noOpen) {
    console.log('[4/4] Opening RelayHQ in your browser...')
    try {
      openBrowser('http://127.0.0.1:44211')
    } catch {
      console.log('Browser auto-open skipped.')
    }
  }

  console.log('RelayHQ is ready at http://127.0.0.1:44211')
  console.log(`Workspace created in ${options.targetDir}`)
  console.log('Next: open the app and complete the onboarding flow.')
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : 'unknown error'
  fail(message)
}
