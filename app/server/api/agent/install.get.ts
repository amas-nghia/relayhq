import { defineEventHandler, getQuery } from "h3";

import { buildProtocolPack, type RelayHQRuntime, PROTOCOL_PACK_TARGETS } from "../../services/agents/protocol-pack";
import { readConfiguredVaultRoot, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

const DEFAULT_BASE_URL = "http://127.0.0.1:44210";

export interface AgentInstallResponse {
  readonly runtime: RelayHQRuntime;
  readonly filename: string;
  readonly content: string;
}

function readString(queryValue: string | string[] | undefined): string | undefined {
  if (typeof queryValue === "string" && queryValue.trim().length > 0) {
    return queryValue.trim();
  }

  return undefined;
}

export function getAgentInstall(runtime: string, options: { baseUrl?: string; vaultRoot?: string; agentId?: string } = {}): AgentInstallResponse {
  const normalizedRuntime = runtime as RelayHQRuntime;
  const target = PROTOCOL_PACK_TARGETS[normalizedRuntime];
  if (target === undefined) {
    throw new Error(`Unknown runtime: ${runtime}`);
  }

  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  const vaultRoot = (options.vaultRoot ?? resolveVaultWorkspaceRoot()).trim();
  const agentId = (options.agentId ?? normalizedRuntime).trim();

  return {
    runtime: normalizedRuntime,
    filename: target.path,
    content: buildProtocolPack(normalizedRuntime, { baseUrl, vaultRoot, agentId, cwd: process.cwd() }),
  };
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const runtime = readString(query.runtime);
  if (runtime === undefined) {
    throw new Error("runtime is required.");
  }

  const response = getAgentInstall(runtime, {
    baseUrl: readString(query.baseUrl) ?? DEFAULT_BASE_URL,
    vaultRoot: readString(query.vaultRoot) ?? readConfiguredVaultRoot() ?? resolveVaultWorkspaceRoot(),
    agentId: readString(query.agentId) ?? runtime,
  });

  return response;
});
