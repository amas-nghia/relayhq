import { randomUUID } from "node:crypto";
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
    model: String(body.model).trim(),
    capabilities: [],
    task_types_accepted: [],
    approval_required_for: [],
    cannot_do: [],
    accessible_by: [],
    skill_file: `skills/${String(body.role).trim()}.md`,
    status: "available",
    workspace_id: workspaceId,
    created_at: timestamp,
    updated_at: timestamp,
  };
  assertAgentFrontmatter(frontmatter);
  const markdown = `---\nid: ${JSON.stringify(id)}\ntype: agent\nname: ${JSON.stringify(frontmatter.name)}\n${frontmatter.account_id === undefined ? '' : `account_id: ${JSON.stringify(frontmatter.account_id)}\n`}role: ${JSON.stringify(frontmatter.role)}\nroles: ${JSON.stringify(frontmatter.roles)}\nprovider: ${JSON.stringify(frontmatter.provider)}\n${frontmatter.api_key_ref === undefined ? '' : `api_key_ref: ${JSON.stringify(frontmatter.api_key_ref)}\n`}model: ${JSON.stringify(frontmatter.model)}\ncapabilities: []\ntask_types_accepted: []\napproval_required_for: []\ncannot_do: []\naccessible_by: []\nskill_file: ${JSON.stringify(frontmatter.skill_file)}\nstatus: "available"\nworkspace_id: ${JSON.stringify(workspaceId)}\ncreated_at: ${timestamp}\nupdated_at: ${timestamp}\n---\n\n# ${frontmatter.name}\n`;
  await writeFile(filePath, markdown, { flag: "wx" });
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
