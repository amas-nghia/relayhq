import { sweepAssignedTasksForDispatch } from "../services/agents/dispatch";
import { readCanonicalVaultReadModel } from "../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../services/vault/runtime";

const DEFAULT_SWEEP_INTERVAL_MS = 30_000;

export default defineNitroPlugin(() => {
  const state = globalThis as typeof globalThis & { __relayhqAssignedTaskDispatchSweep?: ReturnType<typeof setInterval> };
  if (state.__relayhqAssignedTaskDispatchSweep) {
    return;
  }

  const intervalMs = Number(process.env.RELAYHQ_ASSIGNED_DISPATCH_INTERVAL_MS ?? DEFAULT_SWEEP_INTERVAL_MS);
  const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_SWEEP_INTERVAL_MS;

  state.__relayhqAssignedTaskDispatchSweep = setInterval(() => {
    const vaultRoot = resolveVaultWorkspaceRoot();
    void readCanonicalVaultReadModel(vaultRoot)
      .then((readModel) => sweepAssignedTasksForDispatch({ readModel, vaultRoot }))
      .catch((error) => {
        console.error("[relayhq] assigned task dispatch sweep failed", error);
      })
  }, safeIntervalMs);
});
