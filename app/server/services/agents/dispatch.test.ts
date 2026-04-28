import { describe, expect, test } from 'bun:test'

import { evaluateTaskDispatch } from './dispatch'

function createReadModel(overrides: { task?: Record<string, unknown>; agent?: Record<string, unknown> } = {}) {
  const agent = {
    id: 'gpt-4-0-lumina',
    aliases: [],
    runtimeKind: 'opencode',
    runMode: 'subprocess',
    runCommand: null,
    commandTemplate: 'opencode run "{prompt}"',
    provider: 'openai',
    webhookUrl: null,
  }
  const task = {
    id: 'task-001',
    status: 'todo',
    assignee: 'gpt-4-0-lumina',
    lockedBy: null,
    blockedReason: null,
    approvalNeeded: false,
    nextRunAt: null,
    dependsOn: [],
  }
  return {
    tasks: [{ ...task, ...overrides.task }],
    agents: [{ ...agent, ...overrides.agent }],
  } as never
}

describe('evaluateTaskDispatch', () => {
  test('returns ready when a task can auto-start', () => {
    const decision = evaluateTaskDispatch({
      readModel: createReadModel(),
      taskId: 'task-001',
      agentId: 'gpt-4-0-lumina',
      runtimeReadinessReader: () => ({ agentId: 'gpt-4-0-lumina', runtimeKind: 'opencode', launchMode: 'subprocess', verificationStatus: 'ready', installed: true, command: 'opencode', path: '/bin/opencode', reason: null }),
      activeSessionsReader: () => [],
    })

    expect(decision.status).toBe('ready')
    expect(decision.nextAction).toBe('launch')
  })

  test('blocks on incomplete dependencies', () => {
    const decision = evaluateTaskDispatch({
      readModel: {
        ...createReadModel({ task: { dependsOn: ['task-002'] } }),
        tasks: [
          { id: 'task-001', status: 'todo', assignee: 'gpt-4-0-lumina', lockedBy: null, blockedReason: null, approvalNeeded: false, nextRunAt: null, dependsOn: ['task-002'] },
          { id: 'task-002', status: 'review', assignee: 'other', lockedBy: null, blockedReason: null, approvalNeeded: false, nextRunAt: null, dependsOn: [] },
        ],
      } as never,
      taskId: 'task-001',
      agentId: 'gpt-4-0-lumina',
      runtimeReadinessReader: () => ({ agentId: 'gpt-4-0-lumina', runtimeKind: 'opencode', launchMode: 'subprocess', verificationStatus: 'ready', installed: true, command: 'opencode', path: '/bin/opencode', reason: null }),
      activeSessionsReader: () => [],
    })

    expect(decision.status).toBe('blocked')
    expect(decision.reason).toContain('dependencies')
  })

  test('blocks when runtime is not ready', () => {
    const decision = evaluateTaskDispatch({
      readModel: createReadModel(),
      taskId: 'task-001',
      agentId: 'gpt-4-0-lumina',
      runtimeReadinessReader: () => ({ agentId: 'gpt-4-0-lumina', runtimeKind: 'opencode', launchMode: 'subprocess', verificationStatus: 'failed', installed: false, command: 'opencode', path: null, reason: 'opencode not found' }),
      activeSessionsReader: () => [],
    })

    expect(decision.status).toBe('blocked')
    expect(decision.reason).toContain('opencode')
  })

  test('blocks when the agent already has an active session', () => {
    const decision = evaluateTaskDispatch({
      readModel: createReadModel(),
      taskId: 'task-001',
      agentId: 'gpt-4-0-lumina',
      runtimeReadinessReader: () => ({ agentId: 'gpt-4-0-lumina', runtimeKind: 'opencode', launchMode: 'subprocess', verificationStatus: 'ready', installed: true, command: 'opencode', path: '/bin/opencode', reason: null }),
      activeSessionsReader: () => ([{ status: 'running' }] as never),
    })

    expect(decision.status).toBe('blocked')
    expect(decision.reason).toContain('active session')
  })
})
