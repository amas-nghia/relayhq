import { homedir } from "node:os";

import { getAgentToolPreset } from "../../services/agents/discovery";

export interface McpSnippetDescriptor {
  readonly snippet: string;
  readonly configFilePath: string;
  readonly instruction: string;
}

export function generateMcpSnippet(toolId: string, vaultRoot: string, baseUrl: string, homeDirectory = homedir()): McpSnippetDescriptor {
  const preset = getAgentToolPreset(toolId, homeDirectory);
  if (preset === null) {
    throw new Error(`Unsupported tool id: ${toolId}`);
  }

  const snippet = JSON.stringify({
    mcpServers: {
      relayhq: {
        command: "npx",
        args: ["relayhq-mcp"],
        env: {
          RELAYHQ_BASE_URL: baseUrl,
          RELAYHQ_VAULT_ROOT: vaultRoot,
        },
      },
    },
  }, null, 2);

  return {
    snippet,
    configFilePath: preset.configPath,
    instruction: `Paste this JSON into ${preset.configPath} and restart ${preset.name}.`,
  };
}
