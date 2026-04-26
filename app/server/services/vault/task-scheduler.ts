import { writeAuditNote } from "./audit-write";
import { readSharedVaultCollections } from "./read";
import { resolveVaultWorkspaceRoot } from "./runtime";
import { syncTaskDocument } from "./write";

const DEFAULT_SCHEDULER_ACTOR_ID = "relayhq-scheduler" as const;

export interface ReleaseDueScheduledTasksRequest {
  readonly now?: Date;
  readonly vaultRoot?: string;
  readonly actorId?: string;
}

export interface ReleasedScheduledTask {
  readonly taskId: string;
  readonly previousNextRunAt: string;
}

export interface ReleaseDueScheduledTasksResult {
  readonly released: ReadonlyArray<ReleasedScheduledTask>;
}

function isDueScheduledTask(task: { readonly status: string; readonly next_run_at?: string | null }, now: Date): task is { readonly id: string; readonly next_run_at: string } & typeof task {
  return task.status === "scheduled"
    && typeof task.next_run_at === "string"
    && task.next_run_at.trim().length > 0
    && !Number.isNaN(Date.parse(task.next_run_at))
    && Date.parse(task.next_run_at) <= now.getTime();
}

export async function releaseDueScheduledTasks(request: ReleaseDueScheduledTasksRequest = {}): Promise<ReleaseDueScheduledTasksResult> {
  const now = request.now ?? new Date();
  const vaultRoot = request.vaultRoot ?? resolveVaultWorkspaceRoot();
  const actorId = request.actorId ?? DEFAULT_SCHEDULER_ACTOR_ID;
  const collections = await readSharedVaultCollections(vaultRoot);
  const dueTasks = collections.tasks.map((entry) => entry.frontmatter).filter((task) => isDueScheduledTask(task, now));
  const released: ReleasedScheduledTask[] = [];

  for (const task of dueTasks) {
    await syncTaskDocument({
      filePath: `${vaultRoot}/vault/shared/tasks/${task.id}.md`,
      actorId,
      now,
      recoverStaleLock: true,
      releaseLock: true,
      mutate: () => ({
        status: "todo",
        column: "todo",
        next_run_at: null,
        blocked_reason: null,
        blocked_since: null,
      }),
    });

    await writeAuditNote({
      vaultRoot,
      taskId: task.id,
      source: actorId,
      message: `scheduled task re-queued after ${task.next_run_at}`,
      now,
    });

    released.push({ taskId: task.id, previousNextRunAt: task.next_run_at });
  }

  return { released };
}
