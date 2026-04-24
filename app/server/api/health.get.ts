import { defineEventHandler } from "h3";

import { resolveVaultWorkspaceRoot } from "../services/vault/runtime";

const APP_VERSION = process.env.npm_package_version ?? "0.0.0";

export default defineEventHandler(() => ({
  status: "ok",
  version: APP_VERSION,
  uptime: process.uptime(),
  vaultRoot: resolveVaultWorkspaceRoot(),
}));
