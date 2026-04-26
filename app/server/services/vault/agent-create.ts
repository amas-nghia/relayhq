import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assertAgentFrontmatter, isAllowedModel, isExpensiveModel, type AgentFrontmatter } from "../../../shared/vault/schema";
import { containsSecretMaterial } from "../security/secrets";
import { publishRealtimeUpdate } from "../realtime/bus";
import { VAULT_COLLECTION_DIRECTORIES } from "./repository";
import { readSharedVaultCollections } from "./read";
import { readConfiguredWorkspaceId, resolveVaultWorkspaceRoot } from "./runtime";

export interface CreateAgentInput {
  readonly id?: string;
  readonly name: string;
  readonly accountId?: string | null;
  readonly role: string;
  readonly roles?: ReadonlyArray<string>;
  readonly provider: string;
  readonly apiKeyRef?: string | null;
  readonly model: string;
  readonly monthlyBudgetUsd?: number | null;
  readonly aliases?: ReadonlyArray<string>;
  readonly runCommand?: string | null;
  readonly runMode?: string | null;
  readonly capabilities?: ReadonlyArray<string>;
  readonly taskTypesAccepted?: ReadonlyArray<string>;
  readonly approvalRequiredFor?: ReadonlyArray<string>;
  readonly cannotDo?: ReadonlyArray<string>;
  readonly accessibleBy?: ReadonlyArray<string>;
  readonly skillFile?: string;
  readonly skillFiles?: ReadonlyArray<string>;
  readonly body?: string;
  readonly now?: Date;
  readonly vaultRoot?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface CreateAgentResult {
  readonly sourcePath: string;
  readonly frontmatter: AgentFrontmatter;
  readonly body: string;
}

export class AgentCreateError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AgentCreateError";
    this.statusCode = statusCode;
  }
}

function normalizeRequiredString(value: string, field: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new AgentCreateError(400, `${field} is required.`);
  }

  if (containsSecretMaterial(normalized)) {
    throw new AgentCreateError(400, `${field} must not contain raw secrets.`);
  }

  return normalized;
}

function slugifyAgentId(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) {
    throw new AgentCreateError(400, "name must contain at least one letter or number.");
  }

  return slug;
}

function serializeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function serializeAgentDocument(frontmatter: AgentFrontmatter, body: string): string {
  const lines = [
    `id: ${serializeValue(frontmatter.id)}`,
    `type: ${frontmatter.type}`,
    `name: ${serializeValue(frontmatter.name)}`,
    ...(frontmatter.account_id === undefined ? [] : [`account_id: ${serializeValue(frontmatter.account_id)}`]),
    `role: ${serializeValue(frontmatter.role)}`,
    `provider: ${serializeValue(frontmatter.provider)}`,
    ...(frontmatter.api_key_ref === undefined ? [] : [`api_key_ref: ${serializeValue(frontmatter.api_key_ref)}`]),
    `model: ${serializeValue(frontmatter.model)}`,
    ...(frontmatter.monthly_budget_usd === undefined ? [] : [`monthly_budget_usd: ${serializeValue(frontmatter.monthly_budget_usd)}`]),
    ...(frontmatter.aliases === undefined ? [] : [`aliases: ${serializeValue(frontmatter.aliases)}`]),
    ...(frontmatter.run_command === undefined ? [] : [`run_command: ${serializeValue(frontmatter.run_command)}`]),
    ...(frontmatter.run_mode === undefined ? [] : [`run_mode: ${serializeValue(frontmatter.run_mode)}`]),
    `capabilities: ${serializeValue(frontmatter.capabilities)}`,
    `task_types_accepted: ${serializeValue(frontmatter.task_types_accepted)}`,
    `approval_required_for: ${serializeValue(frontmatter.approval_required_for)}`,
    `cannot_do: ${serializeValue(frontmatter.cannot_do)}`,
    `accessible_by: ${serializeValue(frontmatter.accessible_by)}`,
    `skill_file: ${serializeValue(frontmatter.skill_file)}`,
    ...(frontmatter.skill_files === undefined ? [] : [`skill_files: ${serializeValue(frontmatter.skill_files)}`]),
    `status: ${serializeValue(frontmatter.status)}`,
    `workspace_id: ${serializeValue(frontmatter.workspace_id)}`,
    `created_at: ${serializeValue(frontmatter.created_at)}`,
    `updated_at: ${serializeValue(frontmatter.updated_at)}`,
  ];

  const bodySuffix = body.length > 0 ? `\n${body}` : "";
  return `---\n${lines.join("\n")}\n---${bodySuffix}`;
}

function resolveWorkspaceId(
  configuredWorkspaceId: string | null,
  workspaces: ReadonlyArray<{ readonly frontmatter: { readonly id: string } }>,
): string {
  if (configuredWorkspaceId !== null) {
    const configuredWorkspace = workspaces.find((entry) => entry.frontmatter.id === configuredWorkspaceId);
    if (configuredWorkspace === undefined) {
      throw new AgentCreateError(422, `Configured workspace ${configuredWorkspaceId} was not found.`);
    }

    return configuredWorkspace.frontmatter.id;
  }

  const defaultWorkspace = workspaces[0]?.frontmatter.id;
  if (defaultWorkspace === undefined) {
    throw new AgentCreateError(422, "A shared workspace is required before registering agents.");
  }

  return defaultWorkspace;
}

function buildAgentFrontmatter(input: {
  readonly id: string;
  readonly name: string;
  readonly accountId: string | null;
  readonly role: string;
  readonly roles: ReadonlyArray<string>;
  readonly provider: string;
  readonly apiKeyRef: string | null;
  readonly model: string;
  readonly monthlyBudgetUsd: number | null;
  readonly aliases: ReadonlyArray<string>;
  readonly runCommand: string | null;
  readonly runMode: string | null;
  readonly workspaceId: string;
  readonly now: Date;
  readonly capabilities: ReadonlyArray<string>;
  readonly taskTypesAccepted: ReadonlyArray<string>;
  readonly approvalRequiredFor: ReadonlyArray<string>;
    readonly cannotDo: ReadonlyArray<string>;
    readonly accessibleBy: ReadonlyArray<string>;
    readonly skillFile: string;
    readonly skillFiles: ReadonlyArray<string>;
  }): AgentFrontmatter {
  const timestamp = input.now.toISOString();

  return {
    id: input.id,
    type: "agent",
    name: input.name,
    ...(input.accountId === null ? {} : { account_id: input.accountId }),
    role: input.role,
    roles: input.roles,
    provider: input.provider,
    ...(input.apiKeyRef === null ? {} : { api_key_ref: input.apiKeyRef }),
    model: input.model,
    ...(input.monthlyBudgetUsd === null ? {} : { monthly_budget_usd: input.monthlyBudgetUsd }),
    ...(input.aliases === undefined || input.aliases.length === 0 ? {} : { aliases: [...new Set(input.aliases.map((entry) => entry.trim()).filter((entry) => entry.length > 0))] }),
    ...(input.runCommand === null || input.runCommand === undefined ? {} : { run_command: input.runCommand }),
    ...(input.runMode === null || input.runMode === undefined ? {} : { run_mode: input.runMode as AgentFrontmatter["run_mode"] }),
    capabilities: input.capabilities,
    task_types_accepted: input.taskTypesAccepted,
    approval_required_for: input.approvalRequiredFor,
    cannot_do: input.cannotDo,
    accessible_by: input.accessibleBy,
    skill_file: input.skillFile,
    ...(input.skillFiles.length === 0 ? {} : { skill_files: input.skillFiles }),
    status: "available",
    workspace_id: input.workspaceId,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function createVaultAgent(input: CreateAgentInput): Promise<CreateAgentResult> {
  const name = normalizeRequiredString(input.name, "name");
  const role = normalizeRequiredString(input.role, "role");
  const roles = input.roles === undefined || input.roles.length === 0 ? [role] : [...new Set(input.roles.map((entry) => entry.trim()).filter((entry) => entry.length > 0))];
  const provider = normalizeRequiredString(input.provider, "provider");
  const model = normalizeRequiredString(input.model, "model");
  if (!isAllowedModel(model)) {
    throw new AgentCreateError(400, `model "${model}" is not allowed. Use one of: claude-sonnet-4-6, claude-haiku-4-5, claude-opus-4-7, gpt-4o, gpt-4o-mini, gemini-2.0-flash.`);
  }
  if (isExpensiveModel(model)) {
    console.warn(`[agent-create] WARNING: registering agent "${input.name}" with expensive model "${model}". Consider claude-sonnet-4-6 for routine tasks.`);
  }
  const capabilities = input.capabilities ?? [];
  const taskTypesAccepted = input.taskTypesAccepted ?? [];
  const approvalRequiredFor = input.approvalRequiredFor ?? [];
  const cannotDo = input.cannotDo ?? [];
  const accessibleBy = input.accessibleBy ?? [];
  const skillFile = input.skillFile ?? `skills/${slugifyAgentId(name)}.md`;
  const skillFiles = [...new Set((input.skillFiles ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0))].sort();
  const id = input.id === undefined ? slugifyAgentId(name) : slugifyAgentId(input.id);
  const now = input.now ?? new Date();
  const env = input.env ?? process.env;
  const vaultRoot = input.vaultRoot ?? resolveVaultWorkspaceRoot(process.cwd(), env);
  const collections = await readSharedVaultCollections(vaultRoot);
  const workspaceId = resolveWorkspaceId(readConfiguredWorkspaceId(env), collections.workspaces);
  const frontmatter = buildAgentFrontmatter({
    id,
    name,
    accountId: input.accountId ?? null,
    role,
    roles,
    provider,
    apiKeyRef: input.apiKeyRef ?? null,
    model,
    monthlyBudgetUsd: input.monthlyBudgetUsd ?? null,
    aliases: input.aliases ?? [],
    runCommand: input.runCommand ?? null,
    runMode: input.runMode ?? null,
    workspaceId,
    now,
    capabilities,
    taskTypesAccepted,
    approvalRequiredFor,
    cannotDo,
    accessibleBy,
    skillFile,
    skillFiles,
  });
  const sourcePath = `${VAULT_COLLECTION_DIRECTORIES.agents}/${id}.md`;
  const filePath = join(vaultRoot, sourcePath);
  const body = input.body ?? `# ${name}\n\nRegistered via RelayHQ web UI.`;

  assertAgentFrontmatter(frontmatter);

  try {
    await mkdir(join(vaultRoot, VAULT_COLLECTION_DIRECTORIES.agents), { recursive: true });
    await writeFile(filePath, serializeAgentDocument(frontmatter, body), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
      throw new AgentCreateError(409, `Agent ${id} already exists.`);
    }

    throw error;
  }

  publishRealtimeUpdate({
    kind: "vault.changed",
    reason: "agent.created",
    taskId: null,
    agentId: frontmatter.id,
    source: frontmatter.id,
    timestamp: now.toISOString(),
  });

  return {
    sourcePath,
    frontmatter,
    body,
  };
}
