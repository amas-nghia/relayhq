import { createError, defineEventHandler, readBody } from "h3";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { readCanonicalVaultReadModel } from "../services/vault/read";
import { validateVaultWorkspaceRoot } from "../services/vault/runtime";

export interface SettingsSaveResponse {
  readonly success: true;
  readonly vaultRoot: string;
  readonly workspaceId: string | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

export function readRequestedVaultRoot(body: unknown): string {
  if (!isPlainRecord(body) || typeof body.vaultRoot !== "string" || body.vaultRoot.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "vaultRoot is required and must be a non-empty string." });
  }

  return body.vaultRoot.trim();
}

export function readRequestedWorkspaceId(body: unknown): string | null {
  if (!isPlainRecord(body)) {
    throw createError({ statusCode: 400, statusMessage: "settings body must be an object." });
  }

  if (body.workspaceId === null || body.workspaceId === undefined || body.workspaceId === "") {
    return null;
  }

  if (typeof body.workspaceId !== "string") {
    throw createError({ statusCode: 400, statusMessage: "workspaceId must be a string or null." });
  }

  return body.workspaceId.trim();
}

function mergeEnvSetting(existingContent: string, key: string, value: string | null): string {
  const lines = existingContent.split(/\r?\n/);
  const hasTrailingEmptyLine = lines.length > 0 && lines[lines.length - 1] === "";
  const contentLines = hasTrailingEmptyLine ? lines.slice(0, -1) : lines;
  const nextSetting = value === null ? null : `${key}=${value}`;

  let replaced = false;
  const nextLines = contentLines.map((line) => {
    if (!line.startsWith(`${key}=`)) {
      return line;
    }

    if (replaced) {
      return "";
    }

    replaced = true;
    return nextSetting ?? "";
  }).filter((line, index, collection) => !(line.length === 0 && index === collection.length - 1));

  if (!replaced && nextSetting !== null) {
    nextLines.push(nextSetting);
  }

  return `${nextLines.join("\n")}\n`;
}

export function mergeVaultRootEnvFile(existingContent: string, vaultRoot: string): string {
  return mergeEnvSetting(existingContent, "RELAYHQ_VAULT_ROOT", vaultRoot);
}

export function mergeWorkspaceIdEnvFile(existingContent: string, workspaceId: string | null): string {
  return mergeEnvSetting(existingContent, "RELAYHQ_WORKSPACE_ID", workspaceId);
}

async function readEnvFile(envPath: string): Promise<string> {
  try {
    return await readFile(envPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return "";
    }

    throw error;
  }
}

export async function saveVaultRootSetting(
  vaultRoot: string,
  workspaceId: string | null,
  options: {
    readonly envPath?: string;
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): Promise<SettingsSaveResponse> {
  const validation = await validateVaultWorkspaceRoot(vaultRoot);
  if (!validation.valid) {
    throw createError({
      statusCode: 422,
      statusMessage: validation.reason ?? "Vault root is invalid.",
    });
  }

  const envPath = options.envPath ?? join(process.cwd(), ".env");
  let envFile = await readEnvFile(envPath);
  envFile = mergeVaultRootEnvFile(envFile, validation.path);

  if (workspaceId !== null) {
    const readModel = await readCanonicalVaultReadModel(validation.path);
    if (!readModel.workspaces.some((workspace) => workspace.id === workspaceId)) {
      throw createError({
        statusCode: 422,
        statusMessage: `Workspace ${workspaceId} was not found under the selected vault root.`,
      });
    }
  }

  const nextEnvFile = mergeWorkspaceIdEnvFile(envFile, workspaceId);
  await writeFile(envPath, nextEnvFile, "utf8");

  const env = options.env ?? process.env;
  env.RELAYHQ_VAULT_ROOT = validation.path;
  if (workspaceId === null) {
    delete env.RELAYHQ_WORKSPACE_ID;
  } else {
    env.RELAYHQ_WORKSPACE_ID = workspaceId;
  }

  return {
    success: true,
    vaultRoot: validation.path,
    workspaceId,
  };
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  return saveVaultRootSetting(readRequestedVaultRoot(body), readRequestedWorkspaceId(body));
});
