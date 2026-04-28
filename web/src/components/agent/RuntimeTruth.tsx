import clsx from 'clsx'

import type { AgentRuntimeReadinessResponse } from '../../api/client'
import type { Agent } from '../../types'
import { Badge } from '../ui/badge'

type RuntimeSupportTier = 'supported' | 'experimental' | 'unbound' | 'unknown'

type RuntimeTruthAgent = Pick<Agent, 'runtimeKind' | 'runMode' | 'capabilities'>

const RUNTIME_SUPPORT_TIERS: Record<string, Exclude<RuntimeSupportTier, 'unbound' | 'unknown'>> = {
  opencode: 'supported',
  'claude-code': 'experimental',
  codex: 'experimental',
}

function runtimeDisplayName(runtimeKind: string | null | undefined, runMode: string | null | undefined) {
  if (runtimeKind === 'opencode') return 'OpenCode'
  if (runtimeKind === 'claude-code') return 'Claude Code'
  if (runtimeKind === 'codex') return 'Codex'
  if (runtimeKind && runtimeKind.trim().length > 0) return runtimeKind
  if (runMode === 'manual') return 'Manual launch'
  return 'Unbound runtime'
}

function supportTier(runtimeKind: string | null | undefined): RuntimeSupportTier {
  if (!runtimeKind) return 'unbound'
  return RUNTIME_SUPPORT_TIERS[runtimeKind] ?? 'unknown'
}

function repoEditCapability(agent: RuntimeTruthAgent, runtimeKind: string | null | undefined) {
  const canWriteCode = (agent.capabilities ?? []).includes('write-code')

  if (!runtimeKind) {
    return {
      label: canWriteCode ? 'Write-code declared, no runtime bound' : 'Control-plane only',
      variant: 'warning' as const,
    }
  }

  if (canWriteCode) {
    return {
      label: 'Can edit repo',
      variant: 'success' as const,
    }
  }

  return {
    label: 'No repo-edit capability',
    variant: 'secondary' as const,
  }
}

function supportBadge(tier: RuntimeSupportTier) {
  if (tier === 'supported') return { label: 'Supported runtime', variant: 'success' as const }
  if (tier === 'experimental') return { label: 'Experimental runtime', variant: 'warning' as const }
  if (tier === 'unbound') return { label: 'Unbound runtime', variant: 'danger' as const }
  return { label: 'Unknown runtime', variant: 'secondary' as const }
}

function readinessBadge(readiness: AgentRuntimeReadinessResponse | null | undefined, runMode: string | null | undefined) {
  if (runMode === 'manual') return { label: 'Manual launch', variant: 'secondary' as const }
  if (readiness?.verificationStatus === 'ready') return { label: 'Ready', variant: 'success' as const }
  if (readiness?.verificationStatus === 'failed') return { label: 'Not ready', variant: 'danger' as const }
  return { label: 'Unverified', variant: 'secondary' as const }
}

export function getAgentRuntimeTruth(agent: RuntimeTruthAgent, readiness?: AgentRuntimeReadinessResponse | null) {
  const runtimeKind = readiness?.runtimeKind ?? agent.runtimeKind ?? null
  const tier = supportTier(runtimeKind)
  const runtimeName = runtimeDisplayName(runtimeKind, agent.runMode)
  const repoEdit = repoEditCapability(agent, runtimeKind)
  const readinessState = readinessBadge(readiness, agent.runMode)

  let message: string
  if (tier === 'unbound') {
    message = 'This RelayHQ identity is not bound to an execution runtime yet, so it should not be treated like an autonomous coding agent.'
  } else if (tier === 'experimental') {
    message = `${runtimeName} is experimental in RelayHQ. Do not assume it is as safe or fully supported as the OpenCode path.`
  } else if (repoEdit.label !== 'Can edit repo') {
    message = 'This agent can coordinate work, but it does not currently advertise repo-edit capability.'
  } else {
    message = `${runtimeName} is the bound execution runtime for this agent.`
  }

  return {
    runtimeKind,
    runtimeName,
    tier,
    message,
    support: supportBadge(tier),
    repoEdit,
    readiness: readinessState,
  }
}

export function RuntimeTruthBadges({ agent, readiness, className }: {
  agent: RuntimeTruthAgent
  readiness?: AgentRuntimeReadinessResponse | null
  className?: string
}) {
  const truth = getAgentRuntimeTruth(agent, readiness)

  return (
    <div className={clsx('flex flex-wrap gap-2', className)}>
      <Badge variant="secondary">{truth.runtimeName}</Badge>
      <Badge variant={truth.support.variant}>{truth.support.label}</Badge>
      <Badge variant={truth.repoEdit.variant}>{truth.repoEdit.label}</Badge>
      <Badge variant={truth.readiness.variant}>{truth.readiness.label}</Badge>
    </div>
  )
}

export function RuntimeTruthMessage({ agent, readiness, className }: {
  agent: RuntimeTruthAgent
  readiness?: AgentRuntimeReadinessResponse | null
  className?: string
}) {
  const truth = getAgentRuntimeTruth(agent, readiness)

  return (
    <p
      className={clsx(
        'text-xs',
        truth.tier === 'supported' ? 'text-text-secondary' : truth.tier === 'experimental' ? 'text-status-waiting' : 'text-status-blocked',
        className,
      )}
    >
      {truth.message}
    </p>
  )
}
