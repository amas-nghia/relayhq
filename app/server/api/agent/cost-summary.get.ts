import { defineEventHandler } from "h3";

import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export async function readCostSummary() {
  const model = await readCanonicalVaultReadModel(resolveVaultWorkspaceRoot())
  const completedTasks = model.tasks.filter(task => task.status === 'done' && (task.tokensUsed ?? 0) > 0)
  const total_tokens = completedTasks.reduce((sum, task) => sum + (task.tokensUsed ?? 0), 0)
  const total_cost_usd = completedTasks.reduce((sum, task) => sum + (task.costUsd ?? 0), 0)

  const modelMap = new Map()
  const agentMap = new Map()
  for (const task of completedTasks) {
    const modelKey = task.model ?? 'unknown'
    const agentKey = task.assignee
    const modelEntry = modelMap.get(modelKey) ?? { model: modelKey, task_count: 0, tokens_used: 0, cost_usd: 0 }
    modelEntry.task_count += 1
    modelEntry.tokens_used += task.tokensUsed ?? 0
    modelEntry.cost_usd += task.costUsd ?? 0
    modelMap.set(modelKey, modelEntry)

    const agentEntry = agentMap.get(agentKey) ?? { agent_id: agentKey, tokens_used: 0, cost_usd: 0 }
    agentEntry.tokens_used += task.tokensUsed ?? 0
    agentEntry.cost_usd += task.costUsd ?? 0
    agentMap.set(agentKey, agentEntry)
  }

  const context_reuse_savings = model.auditNotes.filter(note => note.taskId === 'system-agent-session').length > 1 ? total_tokens * 0.1 : 0

  return {
    total_tokens,
    total_cost_usd,
    model_breakdown: [...modelMap.values()],
    agent_breakdown: [...agentMap.values()],
    context_reuse_savings,
  }
}

export default defineEventHandler(async () => await readCostSummary())
