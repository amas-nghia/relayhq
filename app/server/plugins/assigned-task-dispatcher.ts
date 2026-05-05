import { reconcileLiveSessionsWithTaskStatus, sweepAssignedTasksForDispatch } from "../services/agents/dispatch";
import { readCanonicalVaultReadModel } from "../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../services/vault/runtime";

const DEFAULT_SWEEP_INTERVAL_MS = 30_000;

export default defineNitroPlugin(() => {
  if (process.env.RELAYHQ_DISABLE_AUTO_DISPATCH === "true") {
    return;
  }

  const state = globalThis as typeof globalThis & { __relayhqAssignedTaskDispatchSweep?: ReturnType<typeof setInterval> };
  if (state.__relayhqAssignedTaskDispatchSweep) {
    return;
  }

  const intervalMs = Number(process.env.RELAYHQ_ASSIGNED_DISPATCH_INTERVAL_MS ?? DEFAULT_SWEEP_INTERVAL_MS);
  const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_SWEEP_INTERVAL_MS;

  const runSweep = () => {
    const vaultRoot = resolveVaultWorkspaceRoot();
    void readCanonicalVaultReadModel(vaultRoot)
      .then(async (readModel) => {
        await reconcileLiveSessionsWithTaskStatus({ readModel, vaultRoot })
        const nextReadModel = await readCanonicalVaultReadModel(vaultRoot)
        return sweepAssignedTasksForDispatch({ readModel: nextReadModel, vaultRoot })
      })
      .catch((error) => {
        console.error("[relayhq] assigned task dispatch sweep failed", error);
      })
  }

  runSweep()
  state.__relayhqAssignedTaskDispatchSweep = setInterval(runSweep, safeIntervalMs);
});
