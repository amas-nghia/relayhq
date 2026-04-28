import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { getAgentInstall } from "../../../agent/install.get";
import { getSettingsSnippet } from "../../../settings/snippets.get";
import { sweepAssignedTasksForDispatch } from "../../../../services/agents/dispatch";
import { getAgentToolPreset } from "../../../../services/agents/discovery";
import { readCanonicalVaultReadModel } from "../../../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../../../services/vault/runtime";
import { patchVaultAgent } from "../[id].patch";

interface BindRuntimeBody {
  readonly runtime?: string;
}

interface BindAgentRuntimeDependencies {
  readonly getAgentToolPreset?: typeof getAgentToolPreset;
  readonly patchVaultAgent?: typeof patchVaultAgent;
  readonly getAgentInstall?: typeof getAgentInstall;
  readonly getSettingsSnippet?: typeof getSettingsSnippet;
  readonly readCanonicalVaultReadModel?: typeof readCanonicalVaultReadModel;
  readonly resolveVaultWorkspaceRoot?: typeof resolveVaultWorkspaceRoot;
  readonly sweepAssignedTasksForDispatch?: typeof sweepAssignedTasksForDispatch;
}

export async function bindAgentRuntime(agentId: string, body: BindRuntimeBody, dependencies: BindAgentRuntimeDependencies = {}) {
  if (agentId.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "Agent id is required." })
  }

  const readPreset = dependencies.getAgentToolPreset ?? getAgentToolPreset
  const patchAgentRuntime = dependencies.patchVaultAgent ?? patchVaultAgent
  const readInstall = dependencies.getAgentInstall ?? getAgentInstall
  const readSettingsSnippet = dependencies.getSettingsSnippet ?? getSettingsSnippet
  const readModel = dependencies.readCanonicalVaultReadModel ?? readCanonicalVaultReadModel
  const resolveRoot = dependencies.resolveVaultWorkspaceRoot ?? resolveVaultWorkspaceRoot
  const sweepAssigned = dependencies.sweepAssignedTasksForDispatch ?? sweepAssignedTasksForDispatch

  const runtime = typeof body.runtime === "string" && body.runtime.trim().length > 0
    ? body.runtime.trim()
    : "opencode"

  const preset = readPreset(runtime)
  if (preset === null) {
    throw createError({ statusCode: 404, statusMessage: `Runtime ${runtime} is not supported.` })
  }

  await patchAgentRuntime(agentId, {
    patch: {
      runtime_kind: preset.runtimeKind ?? runtime,
      run_mode: preset.runMode ?? "manual",
      command_template: preset.commandTemplate ?? undefined,
      working_directory_strategy: preset.workingDirectoryStrategy ?? undefined,
      supports_resume: preset.supportsResume ?? false,
      supports_streaming: preset.supportsStreaming ?? false,
      bootstrap_strategy: preset.bootstrapStrategy ?? undefined,
      verification_status: preset.verificationStatus ?? "unknown",
    },
  })

  const vaultRoot = resolveRoot()
  const model = await readModel(vaultRoot)
  await sweepAssigned({ readModel: model, vaultRoot })

  return {
    success: true,
    agentId,
    runtime,
    install: readInstall(runtime, { agentId }),
    settingsSnippet: readSettingsSnippet(runtime),
  }
}

export default defineEventHandler(async (event) => {
  const agentId = getRouterParam(event, "id") ?? ""
  const body = await readBody(event)
  return await bindAgentRuntime(agentId, typeof body === "object" && body !== null ? body as BindRuntimeBody : {})
})
