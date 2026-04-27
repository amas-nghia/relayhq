import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { publishRealtimeUpdate } from "../../../services/realtime/bus";
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

function upsertFrontmatterLine(content: string, key: string, value: string | number | ReadonlyArray<string> | undefined): string {
  if (value === undefined) {
    return content
  }

  const line = `${key}: ${typeof value === 'number' ? value : JSON.stringify(value)}`
  const pattern = new RegExp(`^${key}:\\s.*$`, 'm')
  if (pattern.test(content)) {
    return content.replace(pattern, line)
  }

  return content.replace(/^name:\s.*$/m, (match) => `${match}\n${line}`)
}

export async function patchVaultAgent(agentId: string, body: unknown, options: { vaultRoot?: string } = {}) {
  if (!agentId) {
    throw createError({ statusCode: 400, statusMessage: "Agent id is required." })
  }
  if (!isPlainRecord(body)) {
    throw createError({ statusCode: 400, statusMessage: "Request body must be an object." })
  }

  const patch = isPlainRecord(body.patch) ? body.patch : body
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot()
  const filePath = join(resolveSharedVaultPath(vaultRoot), "agents", `${agentId}.md`)

  let content = ""
  try {
    content = await readFile(filePath, "utf8")
  } catch {
    throw createError({ statusCode: 404, statusMessage: `Agent ${agentId} was not found.` })
  }

  let next = content
    .replace(/^name:\s.*$/m, typeof patch.name === "string" && patch.name.trim().length > 0 ? `name: ${JSON.stringify(patch.name.trim())}` : "$&")
    .replace(/^capabilities:\s.*$/m, patch.capabilities !== undefined ? `capabilities: ${JSON.stringify(normalizeStringArray(patch.capabilities, "capabilities"))}` : "$&")
    .replace(/^fallback_models:\s.*$/m, patch.fallback_models !== undefined ? `fallback_models: ${JSON.stringify(normalizeStringArray(patch.fallback_models, "fallback_models"))}` : "$&")
    .replace(/^approval_required_for:\s.*$/m, patch.approval_required_for !== undefined ? `approval_required_for: ${JSON.stringify(normalizeStringArray(patch.approval_required_for, "approval_required_for"))}` : "$&")
    .replace(/^updated_at:\s.*$/m, `updated_at: ${JSON.stringify(new Date().toISOString())}`)

  next = upsertFrontmatterLine(next, "account_id", typeof patch.account_id === "string" && patch.account_id.trim().length > 0 ? patch.account_id.trim() : undefined)
  next = upsertFrontmatterLine(next, "api_key_ref", typeof patch.api_key_ref === "string" && patch.api_key_ref.trim().length > 0 ? patch.api_key_ref.trim() : undefined)
  next = upsertFrontmatterLine(next, "portrait_asset", typeof patch.portrait_asset === "string" && patch.portrait_asset.trim().length > 0 ? patch.portrait_asset.trim() : undefined)
  next = upsertFrontmatterLine(next, "sprite_asset", typeof patch.sprite_asset === "string" && patch.sprite_asset.trim().length > 0 ? patch.sprite_asset.trim() : undefined)
  next = upsertFrontmatterLine(next, "monthly_budget_usd", typeof patch.monthly_budget_usd === "number" ? patch.monthly_budget_usd : undefined)
  next = upsertFrontmatterLine(next, "aliases", patch.aliases !== undefined ? normalizeStringArray(patch.aliases, "aliases") : undefined)
  next = upsertFrontmatterLine(next, "run_command", typeof patch.run_command === "string" && patch.run_command.trim().length > 0 ? patch.run_command.trim() : undefined)
  next = upsertFrontmatterLine(next, "run_mode", typeof patch.run_mode === "string" && patch.run_mode.trim().length > 0 ? patch.run_mode.trim() : undefined)
  next = upsertFrontmatterLine(next, "webhook_url", typeof patch.webhook_url === "string" && patch.webhook_url.trim().length > 0 ? patch.webhook_url.trim() : undefined)

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

  return { success: true, agentId }
}

export default defineEventHandler(async (event) => {
  return await patchVaultAgent(getRouterParam(event, "id") ?? "", await readBody(event))
})
