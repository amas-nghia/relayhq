import { listAgentTaskSessionRecords } from "./session-registry";
import { readCanonicalVaultReadModel } from "../vault/read";
import { patchTaskLifecycle } from "../vault/task-lifecycle";

interface RecoverStoppedSessionTasksDependencies {
  readonly readModelReader?: typeof readCanonicalVaultReadModel;
  readonly sessionRegistryReader?: typeof listAgentTaskSessionRecords;
  readonly patchTaskLifecycleRunner?: typeof patchTaskLifecycle;
}

function buildStoppedSessionRecoveryPatch(sessionId: string) {
  const note = `Runner session ${sessionId} is no longer active. Returning task to todo for manual retry.`;
  return {
    status: "todo" as const,
    column: "todo" as const,
    execution_notes: note,
    blocked_reason: note,
    blocked_since: null,
    completed_at: null,
    dispatch_status: "failed" as const,
    dispatch_reason: note,
    result: null,
  };
}

export async function recoverStoppedSessionTasks(
  vaultRoot: string,
  dependencies: RecoverStoppedSessionTasksDependencies = {},
): Promise<number> {
  const runReadModel = dependencies.readModelReader ?? readCanonicalVaultReadModel;
  const runReadRegistry = dependencies.sessionRegistryReader ?? listAgentTaskSessionRecords;
  const runPatchTaskLifecycle = dependencies.patchTaskLifecycleRunner ?? patchTaskLifecycle;

  const [readModel, sessionRecords] = await Promise.all([
    runReadModel(vaultRoot),
    runReadRegistry(vaultRoot),
  ]);

  let recovered = 0;

  for (const task of readModel.tasks) {
    if (task.status !== "in-progress") continue;
    if (!task.assignee || !task.lockedBy || task.assignee !== task.lockedBy) continue;

    const sessionRecord = sessionRecords.find((record) => record.taskId === task.id && record.agentId === task.assignee);
    if (!sessionRecord || sessionRecord.status !== "stopped") continue;

    await runPatchTaskLifecycle({
      taskId: task.id,
      actorId: task.assignee,
      vaultRoot,
      patch: buildStoppedSessionRecoveryPatch(sessionRecord.sessionId),
      releaseLock: true,
      recoverStaleLock: true,
      recoverActiveLock: true,
    });
    recovered += 1;
  }

  return recovered;
}
