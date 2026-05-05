import { describe, expect, test } from 'bun:test'

import { evaluateTaskDispatch, reconcileLiveSessionsWithTaskStatus, sweepAssignedTasksForDispatch } from './dispatch'

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
        tasks: [
          { id: 'task-001', status: 'todo', assignee: 'gpt-4-0-lumina', lockedBy: null, blockedReason: null, approvalNeeded: false, nextRunAt: null, dependsOn: ['task-002'] },
          { id: 'task-002', status: 'review', assignee: 'other', lockedBy: null, blockedReason: null, approvalNeeded: false, nextRunAt: null, dependsOn: [] },
        ],
        agents: [{
          id: 'gpt-4-0-lumina',
          aliases: [],
          runtimeKind: 'opencode',
          runMode: 'subprocess',
          runCommand: null,
          commandTemplate: 'opencode run "{prompt}"',
          provider: 'openai',
          webhookUrl: null,
        }],
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

  test('blocks when the task already has an active runtime session', () => {
    const decision = evaluateTaskDispatch({
      readModel: createReadModel(),
      taskId: 'task-001',
      agentId: 'gpt-4-0-lumina',
      runtimeReadinessReader: () => ({ agentId: 'gpt-4-0-lumina', runtimeKind: 'opencode', launchMode: 'subprocess', verificationStatus: 'ready', installed: true, command: 'opencode', path: '/bin/opencode', reason: null }),
      activeSessionsReader: () => ([{ status: 'running', taskId: 'task-001', sessionId: 'runner-1', lastEventAt: new Date().toISOString() }] as never),
    })

    expect(decision.status).toBe('blocked')
    expect(decision.reason).toContain('task-001')
    expect(decision.reason).toContain('active runtime session')
  })

  test('does not block launch just because many other runtime sessions exist', () => {
    const decision = evaluateTaskDispatch({
      readModel: {
        tasks: [
          { id: 'task-001', status: 'todo', assignee: 'gpt-4-0-lumina', lockedBy: null, blockedReason: null, approvalNeeded: false, nextRunAt: null, dependsOn: [] },
        ],
        agents: [{
          id: 'gpt-4-0-lumina',
          aliases: [],
          runtimeKind: 'opencode',
          runMode: 'subprocess',
          runCommand: null,
          commandTemplate: 'opencode run "{prompt}"',
          provider: 'openai',
          webhookUrl: null,
        }],
      } as never,
      taskId: 'task-001',
      agentId: 'gpt-4-0-lumina',
      runtimeReadinessReader: () => ({ agentId: 'gpt-4-0-lumina', runtimeKind: 'opencode', launchMode: 'subprocess', verificationStatus: 'ready', installed: true, command: 'opencode', path: '/bin/opencode', reason: null }),
      activeSessionsReader: () => ([
        { status: 'running', taskId: 'task-002', sessionId: 'runner-2', lastEventAt: new Date().toISOString() },
        { status: 'running', taskId: 'task-003', sessionId: 'runner-3', lastEventAt: new Date().toISOString() },
        { status: 'running', taskId: 'task-004', sessionId: 'runner-4', lastEventAt: new Date().toISOString() },
        { status: 'running', taskId: 'task-005', sessionId: 'runner-5', lastEventAt: new Date().toISOString() },
        { status: 'running', taskId: 'task-006', sessionId: 'runner-6', lastEventAt: new Date().toISOString() },
      ] as never),
    })

    expect(decision.status).toBe('ready')
    expect(decision.reason).toBeNull()
  })

  test('returns ready when task is assigned using an agent alias', () => {
    const decision = evaluateTaskDispatch({
      readModel: createReadModel({ agent: { aliases: ['legacy-backend-agent'] } }),
      taskId: 'task-001',
      agentId: 'legacy-backend-agent',
      runtimeReadinessReader: () => ({ agentId: 'gpt-4-0-lumina', runtimeKind: 'opencode', launchMode: 'subprocess', verificationStatus: 'ready', installed: true, command: 'opencode', path: '/bin/opencode', reason: null }),
      activeSessionsReader: () => [],
    })

    expect(decision.status).toBe('ready')
    expect(decision.nextAction).toBe('launch')
  })

  test('blocks coordinator auto-dispatch until a user explicitly opens chat', () => {
    const decision = evaluateTaskDispatch({
      readModel: createReadModel({
        task: { tags: ['coordination', 'orchestration', 'project-coordinator'] },
        agent: { role: 'coordinator', roles: ['coordinator'] },
      }),
      taskId: 'task-001',
      agentId: 'gpt-4-0-lumina',
      runtimeReadinessReader: () => ({ agentId: 'gpt-4-0-lumina', runtimeKind: 'opencode', launchMode: 'subprocess', verificationStatus: 'ready', installed: true, command: 'opencode', path: '/bin/opencode', reason: null }),
      activeSessionsReader: () => [],
    })

    expect(decision.status).toBe('blocked')
    expect(decision.reason).toContain('started on demand')
  })
})

describe('sweepAssignedTasksForDispatch', () => {
  test('persists blocked dispatch reasons for queued assigned tasks', async () => {
    const patches: Array<{ actorId: string; patch: Record<string, unknown> }> = []

    const results = await sweepAssignedTasksForDispatch({
      readModel: createReadModel({ agent: { runMode: 'manual', commandTemplate: null, runtimeKind: null } }),
      patchTaskLifecycleRunner: async ({ actorId, patch }) => {
        patches.push({ actorId, patch: patch as Record<string, unknown> })
        return { previous: {} as never, frontmatter: {} as never, body: '' } as never
      },
    })

    expect(results).toHaveLength(1)
    expect(results[0]?.launched).toBe(false)
    expect(results[0]?.decision.status).toBe('blocked')
    expect(results[0]?.decision.reason).toContain('cannot be pre-verified')
    expect(patches).toHaveLength(1)
    expect(patches[0]).toMatchObject({
      actorId: '@relayhq-dispatcher',
      patch: {
        dispatch_status: 'blocked',
      },
    })
  })

  test('re-assigns to an available agent when the assigned agent has been deleted', async () => {
    const patches: Array<{ actorId: string; patch: Record<string, unknown> }> = []

    const results = await sweepAssignedTasksForDispatch({
      readModel: {
        tasks: [{
          id: 'task-orphan',
          status: 'todo',
          assignee: 'agent-deleted',   // this agent no longer exists
          lockedBy: null,
          blockedReason: null,
          approvalNeeded: false,
          nextRunAt: null,
          dependsOn: [],
          tags: ['bug-fix'],
        }],
        agents: [{
          id: 'agent-available',
          aliases: [],
          runtimeKind: 'opencode',
          runMode: 'subprocess',
          runCommand: null,
          commandTemplate: 'opencode run "{prompt}"',
          provider: 'openai',
          webhookUrl: null,
          status: 'available',
          taskTypesAccepted: ['bug-fix'],
          capabilities: [],
          role: 'worker',
          roles: [],
          workspaceId: 'ws-demo',
          name: 'Available Agent',
          accountId: null,
          apiKeyRef: null,
          portraitAsset: null,
          spriteAsset: null,
          model: 'gpt-4o',
          fallbackModels: [],
          monthlyBudgetUsd: null,
          workingDirectoryStrategy: null,
          supportsResume: false,
          supportsStreaming: false,
          bootstrapStrategy: null,
          verificationStatus: null,
          approvalRequiredFor: [],
          cannotDo: [],
          accessibleBy: [],
          skillFile: '',
          projectId: null,
          type: 'agent',
        }],
      } as never,
      patchTaskLifecycleRunner: async ({ actorId, patch }) => {
        patches.push({ actorId, patch: patch as Record<string, unknown> })
        return { previous: {} as never, frontmatter: {} as never, body: '' } as never
      },
    })

    // The re-assignment patch comes first (assignee change), then dispatch outcome
    const assignPatch = patches.find((p) => p.patch.assignee === 'agent-available')
    expect(assignPatch).toBeDefined()
    expect(assignPatch?.actorId).toBe('@relayhq-dispatcher')
  })

  test('skips todo task when assigned agent is deleted and no replacement is available', async () => {
    const patches: Array<{ actorId: string; patch: Record<string, unknown> }> = []

    const results = await sweepAssignedTasksForDispatch({
      readModel: {
        tasks: [{
          id: 'task-orphan',
          status: 'todo',
          assignee: 'agent-deleted',
          lockedBy: null,
          blockedReason: null,
          approvalNeeded: false,
          nextRunAt: null,
          dependsOn: [],
          tags: ['rare-skill'],
        }],
        agents: [],  // no agents at all
      } as never,
      patchTaskLifecycleRunner: async ({ actorId, patch }) => {
        patches.push({ actorId, patch: patch as Record<string, unknown> })
        return { previous: {} as never, frontmatter: {} as never, body: '' } as never
      },
    })

    expect(results).toHaveLength(0)
    expect(patches).toHaveLength(0)
  })
})

describe('reconcileLiveSessionsWithTaskStatus', () => {
  test('claims todo tasks that already have a live session', async () => {
    const claims: string[] = []

    const reconciled = await reconcileLiveSessionsWithTaskStatus({
      readModel: createReadModel(),
      activeSessionsReader: () => ([{ status: 'running', taskId: 'task-001', sessionId: 'runner-1', lastEventAt: new Date().toISOString(), agentName: 'gpt-4-0-lumina' }] as never),
      claimTaskLifecycleRunner: async ({ taskId }) => {
        claims.push(taskId)
        return { previous: {} as never, frontmatter: {} as never, body: '' } as never
      },
    })

    expect(reconciled).toBe(1)
    expect(claims).toEqual(['task-001'])
  })

  test('reconciles tasks assigned via alias when session uses canonical agent id', async () => {
    const claims: string[] = []

    const reconciled = await reconcileLiveSessionsWithTaskStatus({
      readModel: createReadModel({ task: { assignee: 'legacy-backend-agent' }, agent: { aliases: ['legacy-backend-agent'] } }),
      activeSessionsReader: () => ([{ status: 'running', taskId: 'task-001', sessionId: 'runner-1', lastEventAt: new Date().toISOString(), agentName: 'gpt-4-0-lumina' }] as never),
      claimTaskLifecycleRunner: async ({ taskId }) => {
        claims.push(taskId)
        return { previous: {} as never, frontmatter: {} as never, body: '' } as never
      },
    })

    expect(reconciled).toBe(1)
    expect(claims).toEqual(['task-001'])
  })
})
