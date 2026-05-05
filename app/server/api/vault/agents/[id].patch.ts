import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { agentRunnerManager } from "../../../services/runners/manager";
import { publishRealtimeUpdate } from "../../../services/realtime/bus";
import { readCanonicalVaultReadModel } from "../../../services/vault/read";
import { clearCoordinatorThreadActiveSession } from "../../../services/vault/coordinator-thread";
import { resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../../../services/vault/runtime";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw createError({ statusCode: 400, statusMessage: `${field} must be a string array.` })
  }

  return [...new Set(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0))]
}

function upsertFrontmatterLine(content: string, key: string, value: string | number | boolean | ReadonlyArray<string> | undefined): string {
  if (value === undefined) {
    return content
  }

  const line = `${key}: ${typeof value === 'number' || typeof value === 'boolean' ? value : JSON.stringify(value)}`
  const pattern = new RegExp(`^${key}:\\s.*$`, 'm')
  if (pattern.test(content)) {
    return content.replace(pattern, line)
  }

  return content.replace(/^name:\s.*$/m, (match) => `${match}\n${line}`)
}

function replaceDocumentBody(content: string, body: string): string {
  const normalizedBody = body.replace(/^\n+/, "")
  const closingFenceMatch = content.match(/^---[\s\S]*?\n---\n?/)
  if (!closingFenceMatch) {
    throw createError({ statusCode: 500, statusMessage: "Agent document frontmatter is malformed." })
  }
  return `${closingFenceMatch[0]}${normalizedBody.length > 0 ? `\n${normalizedBody}` : ""}`
}

interface PatchVaultAgentOptions {
  readonly vaultRoot?: string
  readonly runnerManager?: Pick<typeof agentRunnerManager, "getAgentRunners" | "stopRunner">
}

export async function patchVaultAgent(agentId: string, body: unknown, options: PatchVaultAgentOptions = {}) {
  const runnerManager = options.runnerManager ?? agentRunnerManager
  if (!agentId) {
    throw createError({ statusCode: 400, statusMessage: "Agent id is required." })
  }
  if (!isPlainRecord(body)) {
    throw createError({ statusCode: 400, statusMessage: "Request body must be an object." })
  }

  const patch = isPlainRecord(body.patch) ? body.patch : body
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot()
  const shouldRestartLiveSessions = [
    patch.model,
    patch.provider,
    patch.runtime_kind,
    patch.run_command,
    patch.command_template,
    patch.run_mode,
    patch.webhook_url,
    patch.api_key_ref,
  ].some((value) => value !== undefined)
  const filePath = join(resolveSharedVaultPath(vaultRoot), "agents", `${agentId}.md`)

  let content = ""
  try {
    content = await readFile(filePath, "utf8")
  } catch {
    throw createError({ statusCode: 404, statusMessage: `Agent ${agentId} was not found.` })
  }

  let next = content
    .replace(/^name:\s.*$/m, typeof patch.name === "string" && patch.name.trim().length > 0 ? `name: ${JSON.stringify(patch.name.trim())}` : "$&")
    .replace(/^provider:\s.*$/m, typeof patch.provider === "string" && patch.provider.trim().length > 0 ? `provider: ${JSON.stringify(patch.provider.trim())}` : "$&")
    .replace(/^model:\s.*$/m, typeof patch.model === "string" && patch.model.trim().length > 0 ? `model: ${JSON.stringify(patch.model.trim())}` : "$&")
    .replace(/^capabilities:\s.*$/m, patch.capabilities !== undefined ? `capabilities: ${JSON.stringify(normalizeStringArray(patch.capabilities, "capabilities"))}` : "$&")
    .replace(/^task_types_accepted:\s.*$/m, patch.task_types_accepted !== undefined ? `task_types_accepted: ${JSON.stringify(normalizeStringArray(patch.task_types_accepted, "task_types_accepted"))}` : "$&")
    .replace(/^fallback_models:\s.*$/m, patch.fallback_models !== undefined ? `fallback_models: ${JSON.stringify(normalizeStringArray(patch.fallback_models, "fallback_models"))}` : "$&")
    .replace(/^approval_required_for:\s.*$/m, patch.approval_required_for !== undefined ? `approval_required_for: ${JSON.stringify(normalizeStringArray(patch.approval_required_for, "approval_required_for"))}` : "$&")
    .replace(/^updated_at:\s.*$/m, `updated_at: ${JSON.stringify(new Date().toISOString())}`)

  next = upsertFrontmatterLine(next, "account_id", typeof patch.account_id === "string" && patch.account_id.trim().length > 0 ? patch.account_id.trim() : undefined)
  next = upsertFrontmatterLine(next, "api_key_ref", typeof patch.api_key_ref === "string" && patch.api_key_ref.trim().length > 0 ? patch.api_key_ref.trim() : undefined)
  next = upsertFrontmatterLine(next, "portrait_asset", typeof patch.portrait_asset === "string" && patch.portrait_asset.trim().length > 0 ? patch.portrait_asset.trim() : undefined)
  next = upsertFrontmatterLine(next, "sprite_asset", typeof patch.sprite_asset === "string" && patch.sprite_asset.trim().length > 0 ? patch.sprite_asset.trim() : undefined)
  next = upsertFrontmatterLine(next, "monthly_budget_usd", typeof patch.monthly_budget_usd === "number" ? patch.monthly_budget_usd : undefined)
  next = upsertFrontmatterLine(next, "aliases", patch.aliases !== undefined ? normalizeStringArray(patch.aliases, "aliases") : undefined)
  next = upsertFrontmatterLine(next, "runtime_kind", typeof patch.runtime_kind === "string" && patch.runtime_kind.trim().length > 0 ? patch.runtime_kind.trim() : undefined)
  next = upsertFrontmatterLine(next, "run_command", typeof patch.run_command === "string" && patch.run_command.trim().length > 0 ? patch.run_command.trim() : undefined)
  next = upsertFrontmatterLine(next, "command_template", typeof patch.command_template === "string" && patch.command_template.trim().length > 0 ? patch.command_template.trim() : undefined)
  next = upsertFrontmatterLine(next, "run_mode", typeof patch.run_mode === "string" && patch.run_mode.trim().length > 0 ? patch.run_mode.trim() : undefined)
  next = upsertFrontmatterLine(next, "webhook_url", typeof patch.webhook_url === "string" && patch.webhook_url.trim().length > 0 ? patch.webhook_url.trim() : undefined)
  next = upsertFrontmatterLine(next, "working_directory_strategy", typeof patch.working_directory_strategy === "string" && patch.working_directory_strategy.trim().length > 0 ? patch.working_directory_strategy.trim() : undefined)
  next = upsertFrontmatterLine(next, "supports_resume", typeof patch.supports_resume === "boolean" ? patch.supports_resume : undefined)
  next = upsertFrontmatterLine(next, "supports_streaming", typeof patch.supports_streaming === "boolean" ? patch.supports_streaming : undefined)
  next = upsertFrontmatterLine(next, "bootstrap_strategy", typeof patch.bootstrap_strategy === "string" && patch.bootstrap_strategy.trim().length > 0 ? patch.bootstrap_strategy.trim() : undefined)
  next = upsertFrontmatterLine(next, "verification_status", typeof patch.verification_status === "string" && patch.verification_status.trim().length > 0 ? patch.verification_status.trim() : undefined)
  next = upsertFrontmatterLine(next, "skill_file", typeof patch.skill_file === "string" && patch.skill_file.trim().length > 0 ? patch.skill_file.trim() : undefined)
  next = upsertFrontmatterLine(next, "skill_files", patch.skill_files !== undefined ? normalizeStringArray(patch.skill_files, "skill_files") : undefined)

  if (typeof patch.body === "string") {
    next = replaceDocumentBody(next, patch.body)
  }

  if (patch.fallback_models !== undefined) {
    const line = `fallback_models: ${JSON.stringify(normalizeStringArray(patch.fallback_models, "fallback_models"))}`
    const pattern = /^fallback_models:\s.*$/m
    next = pattern.test(next)
      ? next.replace(pattern, line)
      : next.replace(/^model:\s.*$/m, (match) => `${match}\n${line}`)
  }

  await writeFile(filePath, next, "utf8")

  publishRealtimeUpdate({
    kind: "vault.changed",
    reason: "agent.updated",
    taskId: null,
    agentId,
    source: agentId,
    timestamp: new Date().toISOString(),
  });

  if (shouldRestartLiveSessions) {
    console.info('[RelayHQ][agent-patch] restart launch-affecting sessions', {
      agentId,
      shouldRestartLiveSessions,
      patchKeys: Object.keys(patch),
    })
    for (const runner of runnerManager.getAgentRunners(agentId)) {
      console.info('[RelayHQ][agent-patch] stopping runner', { agentId, sessionId: runner.sessionId, status: runner.status })
      runnerManager.stopRunner(runner.sessionId, "Agent configuration changed; restarting sessions to apply the updated model.")
    }

    const readModel = await readCanonicalVaultReadModel(vaultRoot)
    const coordinatorProjects = readModel.projects.filter((project) => project.coordinatorAgentId === agentId)
    for (const project of coordinatorProjects) {
      const threadPath = join(resolveSharedVaultPath(vaultRoot), "coordinator-threads", `coordinator-thread-${project.id}.md`)
      console.info('[RelayHQ][agent-patch] clearing coordinator thread active session', { agentId, projectId: project.id, threadPath })
      await clearCoordinatorThreadActiveSession(threadPath)
    }
  }

  return { success: true, agentId }
}

export default defineEventHandler(async (event) => {
  return await patchVaultAgent(getRouterParam(event, "id") ?? "", await readBody(event))
})
