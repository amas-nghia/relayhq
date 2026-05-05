import { createVaultTask } from "../vault/task-create";
import { readCanonicalVaultReadModel } from "../vault/read";

export const COORDINATOR_TASK_TAGS = ["coordination", "orchestration", "project-coordinator"] as const;

export async function ensureCoordinatorTask(projectId: string, coordinatorAgentId: string, projectName: string, vaultRoot: string) {
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const existingTask = readModel.tasks.find((task) => task.projectId === projectId
    && COORDINATOR_TASK_TAGS.every((tag) => task.tags.includes(tag))
    && task.status !== "done"
    && task.status !== "cancelled");
  if (existingTask) {
    return existingTask.id;
  }

  const board = readModel.boards.find((entry) => entry.projectId === projectId) ?? null;
  const column = board
    ? [...readModel.columns]
        .filter((entry) => entry.boardId === board.id)
        .sort((left, right) => left.position - right.position)[0] ?? null
    : null;
  if (!board || !column) {
    return null;
  }

  const created = await createVaultTask({
    title: `${projectName} coordination`,
    projectId,
    boardId: board.id,
    columnId: column.id,
    priority: "high",
    tags: [...COORDINATOR_TASK_TAGS],
    body: [
      "## Objective",
      "Act as the project coordinator chat entrypoint for this project. Break requests into worker tasks, orchestrate handoffs, and summarize progress without implementing code changes directly.",
      "",
      "## Acceptance Criteria",
      "- Route implementation work to worker agents instead of doing it directly.",
      "- Create or update worker tasks when new requests arrive.",
      "- Keep responses concise and retrieve extra context selectively.",
      "",
      "## Constraints",
      "- Do not execute implementation work yourself.",
      "- Prefer warm resume, summary reload, and selective retrieval over large full-context reloads.",
    ].join("\n"),
    vaultRoot,
  });

  return created.frontmatter.id;
}
