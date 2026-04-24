import { defineEventHandler } from "h3";

import { readConfiguredVaultRoot, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";
import { scanAgentTools } from "../../services/agents/discovery";
import { generateMcpSnippet, type McpSnippetDescriptor } from "./snippets";

const DEFAULT_BASE_URL = "http://127.0.0.1:44210";

export interface ScannedAgentTool extends Awaited<ReturnType<typeof scanAgentTools>>[number] {
  readonly snippet: McpSnippetDescriptor;
}

export interface ScanAgentsResponse {
  readonly discovered: ReadonlyArray<ScannedAgentTool>;
}

export async function scanAgents(options: Parameters<typeof scanAgentTools>[0] = {}): Promise<ScanAgentsResponse> {
  const env = options.env ?? process.env;
  const vaultRoot = readConfiguredVaultRoot(env) ?? options.vaultRoot ?? resolveVaultWorkspaceRoot(undefined, env);
  const discovered = await scanAgentTools(options);
  return {
    discovered: discovered.map((tool) => ({
      ...tool,
      snippet: generateMcpSnippet(tool.id, vaultRoot, DEFAULT_BASE_URL, options.homeDirectory),
    })),
  };
}

export default defineEventHandler(async () => await scanAgents());
