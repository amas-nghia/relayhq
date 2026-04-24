import { defineEventHandler, readBody } from "h3";

import { validateVaultWorkspaceRoot } from "../../services/vault/runtime";

export interface SettingsValidationResponse {
  readonly valid: boolean;
  readonly path: string;
  readonly reason?: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function validateSettingsPathBody(body: unknown): Promise<SettingsValidationResponse> {
  if (!isPlainRecord(body) || typeof body.path !== "string") {
    return {
      valid: false,
      path: "",
      reason: "path is required and must be a string.",
    };
  }

  const validation = await validateVaultWorkspaceRoot(body.path);

  return validation.valid
    ? {
        valid: true,
        path: validation.path,
      }
    : {
        valid: false,
        path: validation.path,
        reason: validation.reason ?? "Vault root is invalid.",
      };
}

export default defineEventHandler(async (event) => validateSettingsPathBody(await readBody(event)));
