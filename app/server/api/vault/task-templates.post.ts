import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createError, defineEventHandler, readBody } from "h3";

import { resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

function normalizeLines(value: unknown): string[] {
  if (typeof value !== "string") return []
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

export async function createTaskTemplate(body: unknown, options: { vaultRoot?: string } = {}) {
  if (!isPlainRecord(body) || typeof body.name !== "string" || body.name.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "name is required." })
  }

  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot()
  const sharedRoot = resolveSharedVaultPath(vaultRoot)
  const templatesDir = join(sharedRoot, "templates")
  const fileName = `${slugify(body.name) || "template"}.md`
  const filePath = join(templatesDir, fileName)

  const content = [
    "---",
    `name: ${JSON.stringify(body.name.trim())}`,
    `title: ${JSON.stringify(typeof body.title === "string" ? body.title.trim() : body.name.trim())}`,
    "type: \"task-template\"",
    "---",
    "",
    "## Objective",
    "",
    typeof body.objective === "string" ? body.objective.trim() : "",
    "",
    "## Acceptance Criteria",
    "",
    ...normalizeLines(body.acceptanceCriteria).map((line) => `- ${line}`),
    "",
    "## Context Files",
    "",
    ...normalizeLines(body.contextFiles).map((line) => `- ${line}`),
    "",
    "## Constraints",
    "",
    ...normalizeLines(body.constraints).map((line) => `- ${line}`),
    "",
  ].join("\n")

  await mkdir(templatesDir, { recursive: true })
  await writeFile(filePath, content, "utf8")

  return {
    success: true,
    data: {
      name: body.name.trim(),
      path: join("vault", "shared", "templates", fileName),
    },
    error: null,
  }
}

export default defineEventHandler(async (event) => {
  return await createTaskTemplate(await readBody(event))
})
