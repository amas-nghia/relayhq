import { homedir } from "node:os";

import { getAgentToolPreset } from "../../services/agents/discovery";

export interface McpSnippetDescriptor {
  readonly snippet: string;
  readonly configFilePath: string;
  readonly instruction: string;
}

function buildSnippet(toolId: string, vaultRoot: string, baseUrl: string): string {
  if (toolId === "opencode") {
    return JSON.stringify({
      mcp: {
        relayhq: {
          type: "local",
          command: ["npx", "relayhq-mcp"],
          environment: {
            RELAYHQ_BASE_URL: baseUrl,
            RELAYHQ_VAULT_ROOT: vaultRoot,
          },
          enabled: true,
        },
      },
    }, null, 2);
  }

  return JSON.stringify({
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
}

export function generateMcpSnippet(toolId: string, vaultRoot: string, baseUrl: string, homeDirectory = homedir()): McpSnippetDescriptor {
  const preset = getAgentToolPreset(toolId, homeDirectory);
  if (preset === null) {
    throw new Error(`Unsupported tool id: ${toolId}`);
  }

  return {
    snippet: buildSnippet(toolId, vaultRoot, baseUrl),
    configFilePath: preset.configPath,
    instruction: `Paste this JSON into ${preset.configPath} and restart ${preset.name}.`,
  };
}
