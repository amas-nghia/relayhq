import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createError } from "h3";

import { resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "./runtime";

export interface TaskTemplateRecord {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly objective: string;
  readonly acceptanceCriteria: ReadonlyArray<string>;
  readonly contextFiles: ReadonlyArray<string>;
  readonly constraints: ReadonlyArray<string>;
  readonly sourcePath: string;
}

interface TaskTemplateInput {
  readonly name: string;
  readonly title?: string;
  readonly objective?: string;
  readonly acceptanceCriteria?: string;
  readonly contextFiles?: string;
  readonly constraints?: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeLines(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function parseValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return JSON.parse(trimmed);
  }
  return trimmed;
}

function parseFrontmatter(frontmatter: string): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (match === null) {
      throw new Error(`Unsupported frontmatter line: ${line}`);
    }
    record[match[1]] = parseValue(match[2]);
  }
  return record;
}

function splitDocument(content: string): { readonly frontmatter: string; readonly body: string } {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") {
    throw new Error("Template document must start with YAML frontmatter.");
  }
  const closingFenceIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingFenceIndex === -1) {
    throw new Error("Template document is missing a closing frontmatter fence.");
  }
  return {
    frontmatter: lines.slice(1, closingFenceIndex).join("\n"),
    body: lines.slice(closingFenceIndex + 1).join("\n"),
  };
}

function readSection(body: string, heading: string): string | null {
  const match = body.match(new RegExp(`(?:^|\\n)##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i"));
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

function readBulletItems(body: string, heading: string): ReadonlyArray<string> {
  const section = readSection(body, heading);
  if (section === null) return [];
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function resolveTemplatesDir(vaultRoot: string): string {
  return join(resolveSharedVaultPath(vaultRoot), "templates");
}

function toTemplatePath(fileName: string): string {
  return join("vault", "shared", "templates", fileName);
}

export function serializeTaskTemplate(input: TaskTemplateInput): string {
  return [
    "---",
    `name: ${JSON.stringify(input.name.trim())}`,
    `title: ${JSON.stringify(typeof input.title === "string" ? input.title.trim() : input.name.trim())}`,
    "type: \"task-template\"",
    "---",
    "",
    "## Objective",
    "",
    typeof input.objective === "string" ? input.objective.trim() : "",
    "",
    "## Acceptance Criteria",
    "",
    ...normalizeLines(input.acceptanceCriteria).map((line) => `- ${line}`),
    "",
    "## Context Files",
    "",
    ...normalizeLines(input.contextFiles).map((line) => `- ${line}`),
    "",
    "## Constraints",
    "",
    ...normalizeLines(input.constraints).map((line) => `- ${line}`),
    "",
  ].join("\n");
}

export async function readTaskTemplate(templateId: string, options: { vaultRoot?: string } = {}): Promise<TaskTemplateRecord> {
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const id = slugify(templateId.replace(/\.md$/i, ""));
  if (id.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "Template id is required." });
  }

  const fileName = `${id}.md`;
  const filePath = join(resolveTemplatesDir(vaultRoot), fileName);
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT") {
      throw createError({ statusCode: 404, statusMessage: `Task template ${id} was not found.` });
    }
    throw error;
  }

  const split = splitDocument(content);
  const frontmatter = parseFrontmatter(split.frontmatter);
  const name = typeof frontmatter.name === "string" && frontmatter.name.trim().length > 0 ? frontmatter.name.trim() : id;
  const title = typeof frontmatter.title === "string" && frontmatter.title.trim().length > 0 ? frontmatter.title.trim() : name;

  return {
    id,
    name,
    title,
    objective: readSection(split.body, "Objective") ?? "",
    acceptanceCriteria: readBulletItems(split.body, "Acceptance Criteria"),
    contextFiles: readBulletItems(split.body, "Context Files"),
    constraints: readBulletItems(split.body, "Constraints"),
    sourcePath: toTemplatePath(fileName),
  };
}

export async function listTaskTemplates(options: { vaultRoot?: string } = {}): Promise<ReadonlyArray<TaskTemplateRecord>> {
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const templatesDir = resolveTemplatesDir(vaultRoot);

  let entries: ReadonlyArray<string> = [];
  try {
    entries = await readdir(templatesDir);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const templates = await Promise.all(entries
    .filter((entry) => entry.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => readTaskTemplate(entry, { vaultRoot })));

  return templates.sort((left, right) => left.name.localeCompare(right.name));
}

export async function createTaskTemplate(body: unknown, options: { vaultRoot?: string } = {}) {
  if (!isPlainRecord(body) || typeof body.name !== "string" || body.name.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "name is required." });
  }

  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const templatesDir = resolveTemplatesDir(vaultRoot);
  const fileName = `${slugify(body.name) || "template"}.md`;
  const filePath = join(templatesDir, fileName);

  await mkdir(templatesDir, { recursive: true });
  await writeFile(filePath, serializeTaskTemplate(body), "utf8");

  return {
    success: true,
    data: {
      id: fileName.replace(/\.md$/i, ""),
      name: body.name.trim(),
      path: toTemplatePath(fileName),
    },
    error: null,
  };
}

export async function deleteTaskTemplate(templateId: string, options: { vaultRoot?: string } = {}) {
  const template = await readTaskTemplate(templateId, options);
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  await rm(join(vaultRoot, template.sourcePath), { force: true });
  return {
    success: true,
    data: {
      id: template.id,
      path: template.sourcePath,
    },
    error: null,
  };
}
