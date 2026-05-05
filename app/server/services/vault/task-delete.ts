import { rm } from "node:fs/promises";
import { join } from "node:path";

import { createError } from "h3";

import { publishRealtimeUpdate } from "../realtime/bus";
import { readCanonicalVaultReadModel } from "./read";
import { resolveTaskFilePath, resolveVaultWorkspaceRoot } from "./runtime";

export async function deleteVaultTask(taskId: string, options: { actorId: string; vaultRoot?: string } ) {
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const task = readModel.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw createError({ statusCode: 404, statusMessage: `Task ${taskId} was not found.` });
  }

  const taskPath = resolveTaskFilePath(taskId, vaultRoot);
  await rm(taskPath, { force: true });

  const threadIds = task.links.map((link) => link.threadId);
  for (const threadId of threadIds) {
    await rm(join(vaultRoot, "vault", "shared", "threads", `${threadId}.md`), { force: true }).catch(() => undefined);
  }

  publishRealtimeUpdate({
    kind: "vault.changed",
    reason: "task.deleted",
    taskId,
    agentId: task.assignee,
    source: options.actorId,
    timestamp: new Date().toISOString(),
  });

  return { success: true as const, taskId };
}
