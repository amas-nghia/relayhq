import { defineEventHandler } from "h3";

import { resolveVaultWorkspaceRoot } from "../services/vault/runtime";

const APP_VERSION = process.env.npm_package_version ?? "0.0.0";

export function readHealthStatus(options: {
  version?: string;
  uptime?: number;
  vaultRoot?: string;
} = {}) {
  return {
    status: "ok",
    version: options.version ?? APP_VERSION,
    uptime: options.uptime ?? process.uptime(),
    vaultRoot: options.vaultRoot ?? resolveVaultWorkspaceRoot(),
  };
}

export default defineEventHandler(() => readHealthStatus());
