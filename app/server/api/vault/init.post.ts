import { createError, defineEventHandler, readBody } from "h3";

import { buildPrefixedId, scaffoldVault } from "../../../../cli/scaffold";

import { saveVaultRootSetting, type SettingsSaveResponse } from "../settings.post";

const DEFAULT_WORKSPACE_NAME = "My Workspace";

interface VaultInitBody {
  readonly vaultRoot: string;
  readonly workspaceName: string;
}

export interface VaultInitResponse {
  readonly created: ReadonlyArray<string>;
  readonly vaultRoot: string;
  readonly workspaceId: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} is required and must be a non-empty string.`,
    });
  }

  return value.trim();
}

function readOptionalString(value: unknown, fallback: string, field: string): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: `${field} must be a non-empty string when provided.`,
    });
  }

  return value.trim();
}

export function readVaultInitBody(body: unknown): VaultInitBody {
  if (!isPlainRecord(body)) {
    throw createError({
      statusCode: 400,
      statusMessage: "vault init body must be an object.",
    });
  }

  return {
    vaultRoot: readRequiredString(body.vaultRoot, "vaultRoot"),
    workspaceName: readOptionalString(body.workspaceName, DEFAULT_WORKSPACE_NAME, "workspaceName"),
  };
}

export async function initializeVault(
  body: unknown,
  options: {
    readonly envPath?: string;
    readonly env?: NodeJS.ProcessEnv;
  } = {},
): Promise<VaultInitResponse> {
  const request = readVaultInitBody(body);
  const workspaceId = buildPrefixedId("ws", request.workspaceName, "workspace");

  const scaffoldResult = await scaffoldVault({
    vaultRoot: request.vaultRoot,
    workspaceName: request.workspaceName,
    workspaceId,
  });

  if (scaffoldResult.alreadyExists) {
    throw createError({
      statusCode: 409,
      statusMessage: `A vault is already initialised at ${request.vaultRoot}.`,
    });
  }

  const settingsResult: SettingsSaveResponse = await saveVaultRootSetting(request.vaultRoot, workspaceId, options);

  return {
    created: scaffoldResult.created,
    vaultRoot: settingsResult.vaultRoot,
    workspaceId,
  };
}

export default defineEventHandler(async (event) => initializeVault(await readBody(event)));
