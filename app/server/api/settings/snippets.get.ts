import { createError, defineEventHandler, getQuery } from "h3";

import { generateMcpSnippet } from "./snippets";
import { readConfiguredVaultRoot, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

const DEFAULT_BASE_URL = "http://127.0.0.1:44210";

function readString(queryValue: string | string[] | undefined): string | undefined {
  if (typeof queryValue === "string" && queryValue.trim().length > 0) {
    return queryValue.trim();
  }

  return undefined;
}

export function getSettingsSnippet(tool: string, options: { baseUrl?: string; vaultRoot?: string; homeDirectory?: string } = {}) {
  const vaultRoot = options.vaultRoot ?? readConfiguredVaultRoot() ?? resolveVaultWorkspaceRoot();
  return generateMcpSnippet(tool, vaultRoot, options.baseUrl ?? DEFAULT_BASE_URL, options.homeDirectory);
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const tool = readString(query.tool) ?? readString(query.runtime);

  if (tool === undefined) {
    throw createError({ statusCode: 400, statusMessage: "tool is required." });
  }

  return getSettingsSnippet(tool);
});
