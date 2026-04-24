import { createError, defineEventHandler, readBody } from "h3";

import { getAgentToolPreset, scanAgentTools } from "../../services/agents/discovery";
import { AgentCreateError, createVaultAgent } from "../../services/vault/agent-create";

export interface RegisterAgentsResponse {
  readonly created: ReadonlyArray<{ id: string; sourcePath: string }>;
  readonly skipped: ReadonlyArray<{ id: string; reason: "not-detected" | "already-registered" }>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function registerAgents(
  body: unknown,
  options: { vaultRoot?: string; env?: NodeJS.ProcessEnv; homeDirectory?: string; now?: Date } = {},
): Promise<RegisterAgentsResponse> {
  if (!isPlainRecord(body) || !Array.isArray(body.toolIds) || body.toolIds.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    throw createError({ statusCode: 400, statusMessage: "toolIds must be a non-empty string array." });
  }

  const requestedToolIds = Array.from(new Set(body.toolIds.map((toolId) => String(toolId).trim())));
  const scanned = await scanAgentTools(options);
  const scannedById = new Map(scanned.map((entry) => [entry.id, entry]));
  const created: Array<{ id: string; sourcePath: string }> = [];
  const skipped: Array<{ id: string; reason: "not-detected" | "already-registered" }> = [];

  for (const toolId of requestedToolIds) {
    const discovered = scannedById.get(toolId);
    if (discovered === undefined) {
      throw createError({ statusCode: 400, statusMessage: `Unsupported tool id: ${toolId}.` });
    }

    if (!discovered.detected) {
      skipped.push({ id: toolId, reason: "not-detected" });
      continue;
    }

    if (discovered.alreadyRegistered) {
      skipped.push({ id: toolId, reason: "already-registered" });
      continue;
    }

    const preset = getAgentToolPreset(toolId, options.homeDirectory);
    if (preset === null) {
      throw createError({ statusCode: 400, statusMessage: `Unsupported tool id: ${toolId}.` });
    }

    try {
      const result = await createVaultAgent({
        name: preset.name,
        role: preset.role,
        provider: preset.provider,
        model: preset.model,
        capabilities: preset.capabilities,
        taskTypesAccepted: preset.taskTypesAccepted,
        skillFile: `skills/${preset.id}.md`,
        body: `# ${preset.name}\n\nRegistered via RelayHQ agent discovery.\n\n- portrait: ${preset.portrait}\n- config_path: ${preset.configPath}`,
        now: options.now,
        vaultRoot: options.vaultRoot,
        env: options.env,
      });

      created.push({ id: result.frontmatter.id, sourcePath: result.sourcePath });
    } catch (error) {
      if (error instanceof AgentCreateError && error.statusCode === 409) {
        skipped.push({ id: toolId, reason: "already-registered" });
        continue;
      }

      throw error;
    }
  }

  return { created, skipped };
}

export default defineEventHandler(async (event) => {
  const result = await registerAgents(await readBody(event));
  event.node.res.statusCode = 201;
  return result;
});
