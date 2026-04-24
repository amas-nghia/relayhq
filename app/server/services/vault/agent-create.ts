import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assertAgentFrontmatter, type AgentFrontmatter } from "../../../shared/vault/schema";
import { containsSecretMaterial } from "../security/secrets";
import { VAULT_COLLECTION_DIRECTORIES } from "./repository";
import { readSharedVaultCollections } from "./read";
import { readConfiguredWorkspaceId, resolveVaultWorkspaceRoot } from "./runtime";

export interface CreateAgentInput {
  readonly name: string;
  readonly role: string;
  readonly provider: string;
  readonly model: string;
  readonly capabilities?: ReadonlyArray<string>;
  readonly taskTypesAccepted?: ReadonlyArray<string>;
  readonly approvalRequiredFor?: ReadonlyArray<string>;
  readonly cannotDo?: ReadonlyArray<string>;
  readonly accessibleBy?: ReadonlyArray<string>;
  readonly skillFile?: string;
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
    `role: ${serializeValue(frontmatter.role)}`,
    `provider: ${serializeValue(frontmatter.provider)}`,
    `model: ${serializeValue(frontmatter.model)}`,
    `capabilities: ${serializeValue(frontmatter.capabilities)}`,
    `task_types_accepted: ${serializeValue(frontmatter.task_types_accepted)}`,
    `approval_required_for: ${serializeValue(frontmatter.approval_required_for)}`,
    `cannot_do: ${serializeValue(frontmatter.cannot_do)}`,
    `accessible_by: ${serializeValue(frontmatter.accessible_by)}`,
    `skill_file: ${serializeValue(frontmatter.skill_file)}`,
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
  readonly role: string;
  readonly provider: string;
  readonly model: string;
  readonly workspaceId: string;
  readonly now: Date;
  readonly capabilities: ReadonlyArray<string>;
  readonly taskTypesAccepted: ReadonlyArray<string>;
  readonly approvalRequiredFor: ReadonlyArray<string>;
  readonly cannotDo: ReadonlyArray<string>;
  readonly accessibleBy: ReadonlyArray<string>;
  readonly skillFile: string;
}): AgentFrontmatter {
  const timestamp = input.now.toISOString();

  return {
    id: input.id,
    type: "agent",
    name: input.name,
    role: input.role,
    provider: input.provider,
    model: input.model,
    capabilities: input.capabilities,
    task_types_accepted: input.taskTypesAccepted,
    approval_required_for: input.approvalRequiredFor,
    cannot_do: input.cannotDo,
    accessible_by: input.accessibleBy,
    skill_file: input.skillFile,
    status: "available",
    workspace_id: input.workspaceId,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function createVaultAgent(input: CreateAgentInput): Promise<CreateAgentResult> {
  const name = normalizeRequiredString(input.name, "name");
  const role = normalizeRequiredString(input.role, "role");
  const provider = normalizeRequiredString(input.provider, "provider");
  const model = normalizeRequiredString(input.model, "model");
  const capabilities = input.capabilities ?? [];
  const taskTypesAccepted = input.taskTypesAccepted ?? [];
  const approvalRequiredFor = input.approvalRequiredFor ?? [];
  const cannotDo = input.cannotDo ?? [];
  const accessibleBy = input.accessibleBy ?? [];
  const skillFile = input.skillFile ?? `skills/${slugifyAgentId(name)}.md`;
  const id = slugifyAgentId(name);
  const now = input.now ?? new Date();
  const env = input.env ?? process.env;
  const vaultRoot = input.vaultRoot ?? resolveVaultWorkspaceRoot(process.cwd(), env);
  const collections = await readSharedVaultCollections(vaultRoot);
  const workspaceId = resolveWorkspaceId(readConfiguredWorkspaceId(env), collections.workspaces);
  const frontmatter = buildAgentFrontmatter({
    id,
    name,
    role,
    provider,
    model,
    workspaceId,
    now,
    capabilities,
    taskTypesAccepted,
    approvalRequiredFor,
    cannotDo,
    accessibleBy,
    skillFile,
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

  return {
    sourcePath,
    frontmatter,
    body,
  };
}
