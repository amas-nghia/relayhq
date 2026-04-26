import { releaseDueScheduledTasks } from "../services/vault/task-scheduler";

const DEFAULT_SWEEP_INTERVAL_MS = 30_000;

export default defineNitroPlugin(() => {
  if (process.env.RELAYHQ_DISABLE_SCHEDULER === "true") {
    return;
  }

  const schedulerState = globalThis as typeof globalThis & { __relayhqScheduledTaskSweep?: ReturnType<typeof setInterval> };
  if (schedulerState.__relayhqScheduledTaskSweep) {
    return;
  }

  const intervalMs = Number(process.env.RELAYHQ_SCHEDULER_INTERVAL_MS ?? DEFAULT_SWEEP_INTERVAL_MS);
  const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_SWEEP_INTERVAL_MS;

  schedulerState.__relayhqScheduledTaskSweep = setInterval(() => {
    void releaseDueScheduledTasks().catch((error) => {
      console.error("[relayhq] scheduled task sweep failed", error);
    });
  }, safeIntervalMs);
});
