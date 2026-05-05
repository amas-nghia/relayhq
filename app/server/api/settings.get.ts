import { defineEventHandler } from "h3";

import { describeRuntimeCapacity, readConfiguredMaxConcurrentRuntimeInstances, type RuntimeCapacitySnapshot } from "../services/agents/capacity";
import { readCanonicalVaultReadModel } from "../services/vault/read";
import {
  normalizeConfiguredWorkspaceId,
  readConfiguredWorkspaceId,
  readConfiguredVaultRoot,
  resolveVaultWorkspaceRoot,
  validateVaultWorkspaceRoot,
} from "../services/vault/runtime";
import { readTaskRoutingConfig, type TaskRoutingConfig } from "../services/settings/task-routing";

export interface WorkspaceOption {
  readonly id: string;
  readonly name: string;
}

export interface SettingsResponse {
  readonly vaultRoot: string | null;
  readonly resolvedRoot: string;
  readonly isValid: boolean;
  readonly invalidReason: string | null;
  readonly activeWorkspaceId: string | null;
  readonly activeWorkspaceName: string | null;
  readonly availableWorkspaces: ReadonlyArray<WorkspaceOption>;
  readonly maxConcurrentRuntimeInstances: number;
  readonly runtimeCapacity: RuntimeCapacitySnapshot;
  readonly platform: string;
  readonly taskRouting: TaskRoutingConfig;
}

export async function readSettingsState(options: {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
} = {}): Promise<SettingsResponse> {
  const env = options.env ?? process.env;
  const resolvedRoot = resolveVaultWorkspaceRoot(options.cwd ?? process.cwd(), env);
  const validation = await validateVaultWorkspaceRoot(resolvedRoot);
  const activeWorkspaceId = readConfiguredWorkspaceId(env);
  const maxConcurrentRuntimeInstances = readConfiguredMaxConcurrentRuntimeInstances(env);

  if (!validation.valid) {
    return {
      vaultRoot: readConfiguredVaultRoot(env),
      resolvedRoot,
      isValid: validation.valid,
      invalidReason: validation.reason,
      activeWorkspaceId,
      activeWorkspaceName: null,
      availableWorkspaces: [],
        maxConcurrentRuntimeInstances,
        runtimeCapacity: {
          maxConcurrentRuntimeInstances,
          activeRuntimeInstances: 0,
          availableRuntimeSlots: maxConcurrentRuntimeInstances,
          capacityBlockedTaskCount: 0,
        },
      platform: process.platform,
      taskRouting: await readTaskRoutingConfig(resolvedRoot),
    };
  }

  const readModel = await readCanonicalVaultReadModel(resolvedRoot);
  const availableWorkspaces = readModel.workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
  }));
  const normalizedActiveWorkspaceId = normalizeConfiguredWorkspaceId(activeWorkspaceId, availableWorkspaces);
  const activeWorkspace = availableWorkspaces.find((workspace) => workspace.id === normalizedActiveWorkspaceId) ?? null;
  const runtimeCapacity = describeRuntimeCapacity({
    readModel,
    maxConcurrentRuntimeInstances,
  });

  return {
    vaultRoot: readConfiguredVaultRoot(env),
    resolvedRoot,
    isValid: validation.valid,
    invalidReason: validation.reason,
    activeWorkspaceId: normalizedActiveWorkspaceId,
    activeWorkspaceName: activeWorkspace?.name ?? null,
    availableWorkspaces,
    maxConcurrentRuntimeInstances,
    runtimeCapacity,
    platform: process.platform,
    taskRouting: await readTaskRoutingConfig(resolvedRoot),
  };
}

export default defineEventHandler(async () => readSettingsState());
