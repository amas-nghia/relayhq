import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

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

function upsertFrontmatterLine(content: string, key: string, value: string | undefined): string {
  if (value === undefined) {
    return content
  }

  const line = `${key}: ${JSON.stringify(value)}`
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
    .replace(/^approval_required_for:\s.*$/m, patch.approval_required_for !== undefined ? `approval_required_for: ${JSON.stringify(normalizeStringArray(patch.approval_required_for, "approval_required_for"))}` : "$&")
    .replace(/^updated_at:\s.*$/m, `updated_at: ${JSON.stringify(new Date().toISOString())}`)

  next = upsertFrontmatterLine(next, "account_id", typeof patch.account_id === "string" && patch.account_id.trim().length > 0 ? patch.account_id.trim() : undefined)
  next = upsertFrontmatterLine(next, "api_key_ref", typeof patch.api_key_ref === "string" && patch.api_key_ref.trim().length > 0 ? patch.api_key_ref.trim() : undefined)

  await writeFile(filePath, next, "utf8")
  return { success: true, agentId }
}

export default defineEventHandler(async (event) => {
  return await patchVaultAgent(getRouterParam(event, "id") ?? "", await readBody(event))
})
