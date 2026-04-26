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
  npx relayhq init my-workspace --yes
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
  if (command === 'skill') return cmdSkill(positional)

  fail(`Unknown command: "${command}"\nRun "npx relayhq --help" for usage.`)
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
