#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = resolve(__dirname, '..')
const templateDir = join(packageRoot, 'template')

const COMMANDS = {
  init:    'Scaffold a new RelayHQ workspace',
  setup:   'Write agent skill file for a runtime (claude-code | cursor | antigravity | opencode | codex | copilot)',
  start:   'Start RelayHQ services (PM2)',
  stop:    'Stop RelayHQ services (PM2)',
  destroy: 'Stop services and remove workspace directory',
  skill:   'Manage installed skills',
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
  npx relayhq setup claude-code
  npx relayhq setup opencode
  npx relayhq start my-workspace
  npx relayhq stop my-workspace
  npx relayhq destroy my-workspace
`)
}

function parseArgs(argv) {
  const command = argv[0]
  const rest = argv.slice(1)
  const flags = new Set(rest.filter(arg => arg.startsWith('--')))
  const positional = rest.filter(arg => !arg.startsWith('--'))
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

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} exited with code ${result.status ?? 1}`)
  }
  return result.stdout ?? ''
}

function getSkillDir() {
  return join(homedir(), '.relayhq', 'skills')
}

function ensureSkillDir() {
  mkdirSync(getSkillDir(), { recursive: true })
}

function parseSkillFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) fail('SKILL.md missing frontmatter')

  const frontmatter = {}
  const lines = match[1].split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) continue

    const separator = line.indexOf(':')
    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    const rawValue = line.slice(separator + 1).trim()

    if (rawValue === '') {
      const values = []
      let cursor = index + 1
      while (cursor < lines.length && lines[cursor].trim().startsWith('- ')) {
        values.push(lines[cursor].trim().slice(2).trim().replace(/^['"]|['"]$/g, ''))
        cursor += 1
      }
      frontmatter[key] = values
      index = cursor - 1
      continue
    }

    if (rawValue === '[]') {
      frontmatter[key] = []
      continue
    }

    frontmatter[key] = rawValue.replace(/^['"]|['"]$/g, '')
  }

  const required = ['name', 'version', 'description', 'task_types']
  for (const key of required) {
    if (frontmatter[key] === undefined) fail(`SKILL.md missing required field: ${key}`)
  }

  return { frontmatter, body: match[2].trim() }
}

function readInstalledSkills() {
  const skillDir = getSkillDir()
  if (!existsSync(skillDir)) return []

  const entries = readdirSync(skillDir).filter((file) => file.endsWith('.md'))
  return entries.map((file) => {
    const sourcePath = join(skillDir, file)
    const content = readFileSync(sourcePath, 'utf8')
    const parsed = parseSkillFrontmatter(content)
    return {
      name: parsed.frontmatter.name,
      version: parsed.frontmatter.version,
      description: parsed.frontmatter.description,
      content: parsed.body,
      sourcePath,
    }
  })
}

function cleanupDir(path) {
  rmSync(path, { recursive: true, force: true })
}

function parseSemver(version) {
  return version.split('.').map(part => Number.parseInt(part, 10) || 0)
}

function compareSemver(left, right) {
  const leftParts = parseSemver(left)
  const rightParts = parseSemver(right)
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

function findInstalledSkillFiles(skillName) {
  const skillDir = getSkillDir()
  if (!existsSync(skillDir)) return []
  return readdirSync(skillDir)
    .filter((file) => file.startsWith(`${skillName}@`) && file.endsWith('.md'))
    .map((file) => join(skillDir, file))
}

function cmdSkillInstall(packageName) {
  if (!packageName) fail('Usage: npx relayhq skill install <package>')
  ensureSkillDir()

  const packDir = mkdtempSync(join(tmpdir(), 'relayhq-skill-pack-'))
  const extractDir = mkdtempSync(join(tmpdir(), 'relayhq-skill-extract-'))
  const packageTarget = existsSync(packageName) ? resolve(process.cwd(), packageName) : packageName

  try {
    const packOutput = runCapture('npm', ['pack', packageTarget, '--json'], { cwd: packDir })
    const packed = JSON.parse(packOutput)
    const tarballName = Array.isArray(packed) ? packed[0]?.filename : null
    if (!tarballName) fail(`Package not found: ${packageName}`)

    const tarballPath = join(packDir, tarballName)
    run('tar', ['-xzf', tarballPath, '-C', extractDir])

    const skillPath = join(extractDir, 'package', 'SKILL.md')
    if (!existsSync(skillPath)) {
      fail('Package has no SKILL.md at root')
    }

    const content = readFileSync(skillPath, 'utf8')
    const parsed = parseSkillFrontmatter(content)
    const name = parsed.frontmatter.name
    const version = parsed.frontmatter.version
    const destination = join(getSkillDir(), `${name}@${version}.md`)

    if (existsSync(destination)) {
      console.log(`⚠ skill ${name}@${version} already installed`)
      return
    }

    writeFileSync(destination, content, 'utf8')
    console.log(`✓ Installed skill: ${name}@${version}`)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  } finally {
    cleanupDir(packDir)
    cleanupDir(extractDir)
  }
}

function cmdSkillList() {
  const skills = readInstalledSkills()
  if (skills.length === 0) {
    console.log('No skills installed.')
    return
  }

  const nameWidth = Math.max(4, ...skills.map((skill) => skill.name.length))
  const versionWidth = Math.max(7, ...skills.map((skill) => skill.version.length))

  console.log(`Installed skills  (${getSkillDir()})\n`)
  console.log(`${'NAME'.padEnd(nameWidth)}  ${'VERSION'.padEnd(versionWidth)}  DESCRIPTION`)
  for (const skill of skills) {
    console.log(`${skill.name.padEnd(nameWidth)}  ${skill.version.padEnd(versionWidth)}  ${skill.description}`)
  }
  console.log(`\n${skills.length} skill${skills.length === 1 ? '' : 's'} installed. Run "npx relayhq skill install <pkg>" to add more.`)
}

function cmdSkillRemove(skillName) {
  if (!skillName) fail('Usage: npx relayhq skill remove <name>')
  const matchingFiles = findInstalledSkillFiles(skillName)
  if (matchingFiles.length === 0) {
    fail(`Skill not installed: ${skillName}`)
  }

  for (const filePath of matchingFiles) {
    rmSync(filePath, { force: true })
  }
  console.log(`✓ Removed skill: ${skillName}`)
}

function cmdSkill(positional) {
  const [subcommand = ''] = positional
  const args = positional.slice(1)

  if (subcommand === 'install') return cmdSkillInstall(args[0])
  if (subcommand === 'list') return cmdSkillList()
  if (subcommand === 'remove') return cmdSkillRemove(args[0])

  fail('Usage: npx relayhq skill <install|list|remove> [args]')
}

const SUPPORTED_RUNTIMES = ['claude-code', 'cursor', 'antigravity', 'opencode', 'codex', 'copilot']

const RUNTIME_TARGETS = {
  'claude-code':  { path: 'CLAUDE.md',                                          append: true  },
  cursor:         { path: '.cursor/rules/relayhq.mdc',                          append: false },
  antigravity:    { path: '.antigravity/instructions/relayhq.md',               append: false },
  opencode:       { path: '.opencode/agents/relayhq.md',                        append: false },
  codex:          { path: '.codex/instructions/relayhq.md',                     append: false },
  copilot:        { path: '.github/copilot-instructions.md',                    append: true  },
}

// Runtimes that use MCP tools — skill describes when/why, not raw HTTP
const MCP_RUNTIMES = new Set(['claude-code', 'cursor', 'antigravity'])

function buildMcpSkill(runtime, agentId, baseUrl) {
  return `## RelayHQ

RelayHQ is the task coordination layer for this project.
Server: ${baseUrl} · Your agent ID: \`${agentId}\`

### Workflow

| When | Call |
|------|------|
| Start of every session | \`relayhq_inbox(agentId="${agentId}")\` |
| Picking up a task | \`relayhq_start(agentId="${agentId}", taskId="task-xxx")\` |
| Every 5–10 min while working | \`relayhq_progress(agentId="${agentId}", taskId, progress=N, notes="...")\` |
| Work complete | \`relayhq_done(agentId="${agentId}", taskId, result="One-line summary")\` |
| Stuck / missing info | \`relayhq_blocked(agentId="${agentId}", taskId, reason="What's missing")\` |

### Session start rules

1. Call \`relayhq_inbox\` — check \`active\` first. If a task is already in progress, **resume it**.
2. Otherwise pick the highest-priority task from \`inbox\` (assigned to you) or \`pool\` (unassigned).
3. Call \`relayhq_start\` to claim and get full context: \`objective\`, \`acceptance_criteria\`, \`context_files\`, \`constraints\`.

### Hard rules

- **Never mark a task "done" yourself.** \`relayhq_done\` moves it to "review" — a human approves the final step.
- **Heartbeat keeps your lock.** Tasks idle for 30 min are auto-reclaimed. \`relayhq_progress\` resets the timer.
- **Approval gate.** If the task has \`approval_needed: true\`, call \`relayhq_request_approval\` before the risky action.
- Do not read vault Markdown files directly — use the API.
- Claim before starting; do not work on unclaimed tasks.
`
}

function buildHttpSkill(runtime, agentId, baseUrl) {
  const enc = encodeURIComponent(agentId)
  return `## RelayHQ — Agent Protocol

RelayHQ is the task coordination layer for this project.
Server: ${baseUrl} · Your agent ID: \`${agentId}\`

### 1. Session start (every session)

\`\`\`
GET ${baseUrl}/api/agent/state?agentId=${enc}
\`\`\`

Response: \`active\` (resume first) · \`inbox\` (assigned, by priority) · \`pool\` (unassigned, claim before starting)

### 2. Claim + get full context

\`\`\`
POST ${baseUrl}/api/vault/tasks/{taskId}/claim
{"actorId": "${agentId}"}

GET ${baseUrl}/api/agent/bootstrap/{taskId}?agentId=${enc}
\`\`\`

Returns: \`objective\`, \`acceptance_criteria\`, \`context_files\`, \`constraints\`, \`priority\`.

### 3. Heartbeat (every 5–10 min)

\`\`\`
POST ${baseUrl}/api/vault/tasks/{taskId}/heartbeat
{"actorId": "${agentId}"}
\`\`\`

Tasks idle for 30 min are auto-reclaimed.

### 4. Progress update

\`\`\`
PATCH ${baseUrl}/api/vault/tasks/{taskId}
{"actorId": "${agentId}", "patch": {"progress": 60, "execution_notes": "Completed X. Working on Y."}}
\`\`\`

### 5a. Done — move to review

\`\`\`
PATCH ${baseUrl}/api/vault/tasks/{taskId}
{"actorId": "${agentId}", "patch": {"status": "review", "result": "What was done and where to look."}}
\`\`\`

**Never set status "done" directly.** "review" is the agent's final state — a human approves from there.

### 5b. Blocked

\`\`\`
PATCH ${baseUrl}/api/vault/tasks/{taskId}
{"actorId": "${agentId}", "patch": {"status": "blocked", "blocked_reason": "Need X before I can continue."}}
\`\`\`

### 5c. Request human approval

\`\`\`
POST ${baseUrl}/api/vault/tasks/{taskId}/request-approval
{"actorId": "${agentId}", "reason": "About to do Y — need sign-off."}
\`\`\`

Stop and wait. Do not proceed until the approval response comes back.

### Hard rules

- Resume \`active\` before claiming new tasks.
- Never set status "done" — use "review".
- Heartbeat at least every 10 min or your lock expires.
- Do not read vault Markdown files directly.
- Claim pool tasks before starting work on them.
`
}

async function cmdSetup(positional) {
  const runtime = positional[0]
  if (!runtime) fail(`Usage: npx relayhq setup <runtime>\n\nSupported: ${SUPPORTED_RUNTIMES.join(', ')}`)
  if (!SUPPORTED_RUNTIMES.includes(runtime)) {
    fail(`Unknown runtime: "${runtime}"\n\nSupported: ${SUPPORTED_RUNTIMES.join(', ')}`)
  }

  const target = RUNTIME_TARGETS[runtime]
  const baseUrl = (process.env.RELAYHQ_BASE_URL ?? 'http://127.0.0.1:44210').replace(/\/+$/, '')
  const agentId = process.env.RELAYHQ_AGENT_ID ?? runtime

  // Try to get vault root from running server; fall back to env var
  let vaultRoot = process.env.RELAYHQ_VAULT_ROOT ?? ''
  try {
    const { createRequire } = await import('node:module')
    const res = await fetch(`${baseUrl}/api/settings`)
    if (res.ok) {
      const data = await res.json()
      vaultRoot = data.resolvedRoot ?? data.vaultRoot ?? vaultRoot
    }
  } catch { /* server not running — use env var */ }

  const content = MCP_RUNTIMES.has(runtime)
    ? buildMcpSkill(runtime, agentId, baseUrl)
    : buildHttpSkill(runtime, agentId, baseUrl)

  const destPath = resolve(process.cwd(), target.path)
  const marker = '## RelayHQ'

  mkdirSync(dirname(destPath), { recursive: true })

  let existing = ''
  try { existing = readFileSync(destPath, 'utf8') } catch { /* new file */ }

  if (existing.includes(marker)) {
    console.log(`⚠  RelayHQ skill already present in ${target.path} — skipping.`)
    console.log(`   To update, remove the "## RelayHQ" section and re-run.`)
    return
  }

  const next = target.append && existing.trim().length > 0
    ? `${existing.trimEnd()}\n\n${content}`
    : content

  writeFileSync(destPath, next, 'utf8')
  console.log(`✓  Written: ${target.path}`)
  if (vaultRoot) console.log(`   Vault:   ${vaultRoot}`)
  console.log(`   Server:  ${baseUrl}`)
  if (MCP_RUNTIMES.has(runtime)) {
    console.log(`\nNext: add the MCP server entry to your settings, then restart ${runtime}.`)
    console.log(`See: http://127.0.0.1:44211 → step 3 of onboarding for the JSON snippet.`)
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
  if (command === 'setup') return cmdSetup(positional)
  if (command === 'start') return cmdStart(positional)
  if (command === 'stop') return cmdStop(positional)
  if (command === 'destroy') return cmdDestroy(positional)
  if (command === 'skill') return cmdSkill(positional)

  fail(`Unknown command: "${command}"\nRun "npx relayhq --help" for usage.`)
}

Promise.resolve(main()).catch(error => {
  fail(error instanceof Error ? error.message : String(error))
})
