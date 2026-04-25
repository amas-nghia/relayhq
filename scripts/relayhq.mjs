#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = resolve(__dirname, '..')
const templateDir = join(packageRoot, 'template')

const COMMANDS = {
  init:    'Scaffold a new RelayHQ workspace',
  start:   'Start RelayHQ services (PM2)',
  stop:    'Stop RelayHQ services (PM2)',
  destroy: 'Stop services and remove workspace directory',
}

function fail(message) {
  console.error(`\nrelayhq: ${message}`)
  process.exit(1)
}

function showHelp() {
  console.log(`
Usage: npx relayhq <command> [options]

Commands:
${Object.entries(COMMANDS).map(([cmd, desc]) => `  ${cmd.padEnd(10)} ${desc}`).join('\n')}

Examples:
  npx relayhq init my-workspace
  npx relayhq init my-workspace --yes
  npx relayhq start my-workspace
  npx relayhq stop my-workspace
  npx relayhq destroy my-workspace
`)
}

function parseArgs(argv) {
  const command = argv[0]
  const flags = new Set(argv.filter(arg => arg.startsWith('--')))
  const positional = argv.filter(arg => !arg.startsWith('--')).slice(1)
  return { command, flags, positional }
}

function ensureNodeVersion() {
  const major = Number(process.versions.node.split('.')[0])
  if (Number.isNaN(major) || major < 18) {
    fail(`Node.js 18+ is required. Current: ${process.versions.node}`)
  }
}

function ensureBun() {
  const result = spawnSync('bun', ['--version'], { stdio: 'ignore' })
  if (result.status !== 0) {
    fail('Bun is required. Install it from https://bun.sh')
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} exited with code ${result.status ?? 1}`)
  }
}

function copyTemplate(targetDir) {
  if (existsSync(targetDir)) fail(`Directory already exists: ${targetDir}`)
  mkdirSync(targetDir, { recursive: true })
  for (const entry of ['app', 'web', 'backend', 'cli', 'docs', 'ecosystem.config.cjs', 'CLAUDE.md', 'README.md']) {
    cpSync(join(packageRoot, entry), join(targetDir, entry), { recursive: true })
  }
  cpSync(templateDir, join(targetDir, 'vault'), { recursive: true })
}

function patchEcosystemConfig(targetDir) {
  const configPath = join(targetDir, 'ecosystem.config.cjs')
  if (!existsSync(configPath)) return
  let content = readFileSync(configPath, 'utf8')
  content = content.replace(/RELAYHQ_VAULT_ROOT:\s*['"][^'"]*['"]/g, `RELAYHQ_VAULT_ROOT: '${targetDir}'`)
  writeFileSync(configPath, content, 'utf8')
}

function installDependencies(targetDir) {
  run('bun', ['install'], { cwd: join(targetDir, 'app') })
  run('bun', ['install'], { cwd: join(targetDir, 'web') })
}

function pm2Start(targetDir) {
  run('npx', ['pm2', 'start', 'ecosystem.config.cjs'], { cwd: targetDir })
  run('npx', ['pm2', 'save'], { cwd: targetDir })
}

function pm2Stop(targetDir) {
  run('npx', ['pm2', 'stop', 'ecosystem.config.cjs'], { cwd: targetDir })
}

function openBrowser(url) {
  try {
    if (process.platform === 'darwin') execFileSync('open', [url])
    else if (process.platform === 'win32') execFileSync('cmd', ['/c', 'start', '', url])
    else execFileSync('xdg-open', [url])
  } catch { /* no display */ }
}

function cmdInit(positional, flags) {
  if (positional.length === 0) {
    fail('Usage: npx relayhq init <folder> [--skip-install] [--skip-pm2] [--no-open]')
  }
  const targetDir = resolve(process.cwd(), positional[0])
  const skipInstall = flags.has('--skip-install')
  const skipPm2 = flags.has('--skip-pm2')
  const noOpen = flags.has('--no-open')

  ensureNodeVersion()
  if (!skipInstall) ensureBun()

  const steps = [true, !skipInstall, !skipPm2, !noOpen].filter(Boolean).length
  let n = 0
  const step = (msg) => console.log(`\n[${++n}/${steps}] ${msg}`)

  step('Copying RelayHQ template...')
  copyTemplate(targetDir)
  patchEcosystemConfig(targetDir)

  if (!skipInstall) {
    step('Installing dependencies with Bun...')
    installDependencies(targetDir)
  }

  if (!skipPm2) {
    step('Starting RelayHQ services with PM2...')
    pm2Start(targetDir)
  }

  if (!noOpen) {
    step('Opening RelayHQ in your browser...')
    openBrowser('http://127.0.0.1:44211')
  }

  console.log(`
RelayHQ is ready!

  App  →  http://127.0.0.1:44211
  API  →  http://127.0.0.1:44210
  Dir  →  ${targetDir}

Next steps:
  1. Open http://127.0.0.1:44211 and complete the onboarding
  2. Connect your AI agent (Claude Code, Cursor, etc.) via the Connect step
  3. Start creating tasks from the board
`)
}

function cmdStart(positional) {
  if (positional.length === 0) fail('Usage: npx relayhq start <folder>')
  const targetDir = resolve(process.cwd(), positional[0])
  if (!existsSync(targetDir)) fail(`Directory not found: ${targetDir}`)
  console.log('Starting RelayHQ...')
  pm2Start(targetDir)
  console.log('RelayHQ is running at http://127.0.0.1:44211')
}

function cmdStop(positional) {
  if (positional.length === 0) fail('Usage: npx relayhq stop <folder>')
  const targetDir = resolve(process.cwd(), positional[0])
  if (!existsSync(targetDir)) fail(`Directory not found: ${targetDir}`)
  console.log('Stopping RelayHQ...')
  pm2Stop(targetDir)
  console.log('RelayHQ stopped.')
}

function cmdDestroy(positional) {
  if (positional.length === 0) fail('Usage: npx relayhq destroy <folder>')
  const targetDir = resolve(process.cwd(), positional[0])
  if (!existsSync(targetDir)) fail(`Directory not found: ${targetDir}`)
  console.log('Stopping RelayHQ services...')
  try { pm2Stop(targetDir) } catch { /* already stopped */ }
  console.log(`Removing ${targetDir}...`)
  rmSync(targetDir, { recursive: true, force: true })
  console.log('Done. RelayHQ has been removed.')
}

function main() {
  const { command, flags, positional } = parseArgs(process.argv.slice(2))

  if (!command || command === '--help' || command === '-h') {
    showHelp()
    return
  }

  if (command === 'init') return cmdInit(positional, flags)
  if (command === 'start') return cmdStart(positional)
  if (command === 'stop') return cmdStop(positional)
  if (command === 'destroy') return cmdDestroy(positional)

  fail(`Unknown command: "${command}"\nRun "npx relayhq --help" for usage.`)
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
