import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createError, defineEventHandler, readBody } from "h3";

import type { AgentFrontmatter } from "../../../shared/vault/schema";
import { assertAgentFrontmatter } from "../../../shared/vault/schema";
import { readConfiguredWorkspaceId, resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";
import { readCanonicalVaultReadModel } from "../../services/vault/read";

export interface RegisterVaultAgentResult {
  readonly agent: AgentFrontmatter;
  readonly sourcePath: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return [];
  }

  return [...new Set(value.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
}

export async function registerVaultAgent(
  body: unknown,
  options: { vaultRoot?: string; now?: Date; env?: NodeJS.ProcessEnv } = {},
): Promise<RegisterVaultAgentResult> {
  if (!isPlainRecord(body) || [body.name, body.role, body.model, body.provider].some((value) => typeof value !== "string" || value.trim().length === 0)) {
    throw createError({ statusCode: 400, statusMessage: "name, role, model, and provider are required." });
  }

  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot(undefined, options.env ?? process.env);
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const workspaceId = readConfiguredWorkspaceId(options.env ?? process.env) ?? readModel.workspaces[0]?.id;
  if (!workspaceId) {
    throw createError({ statusCode: 422, statusMessage: "No workspace is available for agent creation." });
  }

  const id = slugify(String(body.name));
  const aliases = normalizeStringArray(body.aliases);
  const sharedRoot = resolveSharedVaultPath(vaultRoot);
  const filePath = join(sharedRoot, "agents", `${id}.md`);
  try {
    await access(filePath);
    throw createError({ statusCode: 409, statusMessage: `Agent ${id} already exists.` });
  } catch (error) {
    if (typeof error === "object" && error !== null && "statusCode" in error) {
      throw error;
    }
  }

  await mkdir(join(sharedRoot, "agents"), { recursive: true });
  const timestamp = (options.now ?? new Date()).toISOString();
  const frontmatter: AgentFrontmatter = {
    id,
    type: "agent",
    name: String(body.name).trim(),
    ...(typeof body.accountId === "string" && body.accountId.trim().length > 0 ? { account_id: body.accountId.trim() } : {}),
    role: String(body.role).trim(),
    roles: [String(body.role).trim()],
    provider: String(body.provider).trim(),
    ...(typeof body.apiKeyRef === "string" && body.apiKeyRef.trim().length > 0 ? { api_key_ref: body.apiKeyRef.trim() } : {}),
    ...(typeof body.portraitAsset === "string" && body.portraitAsset.trim().length > 0 ? { portrait_asset: body.portraitAsset.trim() } : {}),
    ...(typeof body.spriteAsset === "string" && body.spriteAsset.trim().length > 0 ? { sprite_asset: body.spriteAsset.trim() } : {}),
    model: String(body.model).trim(),
    ...(typeof body.monthlyBudgetUsd === "number" ? { monthly_budget_usd: body.monthlyBudgetUsd } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(typeof body.runtimeKind === "string" && body.runtimeKind.trim().length > 0 ? { runtime_kind: body.runtimeKind.trim() as AgentFrontmatter["runtime_kind"] } : {}),
    ...(typeof body.runCommand === "string" && body.runCommand.trim().length > 0 ? { run_command: body.runCommand.trim() } : {}),
    ...(typeof body.commandTemplate === "string" && body.commandTemplate.trim().length > 0 ? { command_template: body.commandTemplate.trim() } : {}),
    ...(typeof body.runMode === "string" && body.runMode.trim().length > 0 ? { run_mode: body.runMode.trim() as AgentFrontmatter["run_mode"] } : {}),
    ...(typeof body.webhookUrl === "string" && body.webhookUrl.trim().length > 0 ? { webhook_url: body.webhookUrl.trim() } : {}),
    ...(typeof body.workingDirectoryStrategy === "string" && body.workingDirectoryStrategy.trim().length > 0 ? { working_directory_strategy: body.workingDirectoryStrategy.trim() as AgentFrontmatter["working_directory_strategy"] } : {}),
    ...(typeof body.supportsResume === "boolean" ? { supports_resume: body.supportsResume } : {}),
    ...(typeof body.supportsStreaming === "boolean" ? { supports_streaming: body.supportsStreaming } : {}),
    ...(typeof body.bootstrapStrategy === "string" && body.bootstrapStrategy.trim().length > 0 ? { bootstrap_strategy: body.bootstrapStrategy.trim() as AgentFrontmatter["bootstrap_strategy"] } : {}),
    ...(typeof body.verificationStatus === "string" && body.verificationStatus.trim().length > 0 ? { verification_status: body.verificationStatus.trim() as AgentFrontmatter["verification_status"] } : {}),
    capabilities: [],
    task_types_accepted: [],
    approval_required_for: [],
    cannot_do: [],
    accessible_by: [],
    skill_file: `skills/${String(body.role).trim()}.md`,
    ...(Array.isArray(body.skillFiles) && body.skillFiles.length > 0 ? { skill_files: body.skillFiles.map((value: unknown) => String(value).trim()).filter((value: string) => value.length > 0) } : {}),
    status: "available",
    workspace_id: workspaceId,
    created_at: timestamp,
    updated_at: timestamp,
  };
  assertAgentFrontmatter(frontmatter);

  const markdownLines = [
    "---",
    `id: ${JSON.stringify(id)}`,
    "type: agent",
    `name: ${JSON.stringify(frontmatter.name)}`,
    ...(frontmatter.account_id === undefined ? [] : [`account_id: ${JSON.stringify(frontmatter.account_id)}`]),
    `role: ${JSON.stringify(frontmatter.role)}`,
    `roles: ${JSON.stringify(frontmatter.roles)}`,
    `provider: ${JSON.stringify(frontmatter.provider)}`,
    ...(frontmatter.api_key_ref === undefined ? [] : [`api_key_ref: ${JSON.stringify(frontmatter.api_key_ref)}`]),
    ...(frontmatter.portrait_asset === undefined ? [] : [`portrait_asset: ${JSON.stringify(frontmatter.portrait_asset)}`]),
    ...(frontmatter.sprite_asset === undefined ? [] : [`sprite_asset: ${JSON.stringify(frontmatter.sprite_asset)}`]),
    `model: ${JSON.stringify(frontmatter.model)}`,
    ...(frontmatter.monthly_budget_usd === undefined ? [] : [`monthly_budget_usd: ${frontmatter.monthly_budget_usd}`]),
    ...(frontmatter.aliases === undefined ? [] : [`aliases: ${JSON.stringify(frontmatter.aliases)}`]),
    ...(frontmatter.runtime_kind === undefined ? [] : [`runtime_kind: ${JSON.stringify(frontmatter.runtime_kind)}`]),
    ...(frontmatter.run_command === undefined ? [] : [`run_command: ${JSON.stringify(frontmatter.run_command)}`]),
    ...(frontmatter.command_template === undefined ? [] : [`command_template: ${JSON.stringify(frontmatter.command_template)}`]),
    ...(frontmatter.run_mode === undefined ? [] : [`run_mode: ${JSON.stringify(frontmatter.run_mode)}`]),
    ...(frontmatter.webhook_url === undefined ? [] : [`webhook_url: ${JSON.stringify(frontmatter.webhook_url)}`]),
    ...(frontmatter.working_directory_strategy === undefined ? [] : [`working_directory_strategy: ${JSON.stringify(frontmatter.working_directory_strategy)}`]),
    ...(frontmatter.supports_resume === undefined ? [] : [`supports_resume: ${JSON.stringify(frontmatter.supports_resume)}`]),
    ...(frontmatter.supports_streaming === undefined ? [] : [`supports_streaming: ${JSON.stringify(frontmatter.supports_streaming)}`]),
    ...(frontmatter.bootstrap_strategy === undefined ? [] : [`bootstrap_strategy: ${JSON.stringify(frontmatter.bootstrap_strategy)}`]),
    ...(frontmatter.verification_status === undefined ? [] : [`verification_status: ${JSON.stringify(frontmatter.verification_status)}`]),
    "capabilities: []",
    "task_types_accepted: []",
    "approval_required_for: []",
    "cannot_do: []",
    "accessible_by: []",
    `skill_file: ${JSON.stringify(frontmatter.skill_file)}`,
    ...(frontmatter.skill_files === undefined ? [] : [`skill_files: ${JSON.stringify(frontmatter.skill_files)}`]),
    'status: "available"',
    `workspace_id: ${JSON.stringify(workspaceId)}`,
    `created_at: ${timestamp}`,
    `updated_at: ${timestamp}`,
    "---",
    "",
    `# ${frontmatter.name}`,
    "",
  ];

  await writeFile(filePath, `${markdownLines.join("\n")}`, { flag: "wx" });
  return {
    agent: frontmatter,
    sourcePath: join("vault", "shared", "agents", `${id}.md`),
  };
}

export default defineEventHandler(async (event) => {
  const result = await registerVaultAgent(await readBody(event));
  event.node.res.statusCode = 201;
  return result;
});

export const createVaultAgent = registerVaultAgent;
