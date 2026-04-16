import type { TaskFrontmatter } from "../server/models/read-model";

export interface TaskLifecyclePatch {
  readonly status?: TaskFrontmatter["status"];
  readonly column?: TaskFrontmatter["column"];
  readonly approval_needed?: boolean;
  readonly approval_requested_by?: string | null;
  readonly approval_reason?: string | null;
  readonly approved_by?: string | null;
  readonly approved_at?: string | null;
  readonly approval_outcome?: TaskFrontmatter["approval_outcome"];
  readonly blocked_reason?: string | null;
  readonly blocked_since?: string | null;
}

export interface TaskColumnMoveOption {
  readonly value: TaskFrontmatter["column"];
  readonly label: string;
}

export interface TaskColumnMovePair {
  readonly previous: TaskColumnMoveOption | null;
  readonly next: TaskColumnMoveOption | null;
}

const taskColumnOrder = ["todo", "in-progress", "review", "done"] as const satisfies ReadonlyArray<TaskFrontmatter["column"]>;

const taskColumnLabels: Readonly<Record<TaskFrontmatter["column"], string>> = {
  todo: "Todo",
  "in-progress": "In progress",
  review: "Review",
  done: "Done",
};

function statusForColumn(column: TaskFrontmatter["column"]): TaskFrontmatter["status"] {
  switch (column) {
    case "todo":
      return "todo";
    case "in-progress":
      return "in-progress";
    case "review":
      return "waiting-approval";
    case "done":
      return "done";
  }
}

function toColumnMoveOption(column: TaskFrontmatter["column"] | undefined): TaskColumnMoveOption | null {
  if (column === undefined) {
    return null;
  }

  return {
    value: column,
    label: taskColumnLabels[column],
  };
}

export function buildRequestChangesPatch(reason: string): TaskLifecyclePatch {
  const normalizedReason = reason.trim();

  return {
    status: "todo",
    column: "todo",
    approval_needed: false,
    approval_requested_by: null,
    approval_reason: normalizedReason,
    approved_by: null,
    approved_at: null,
    approval_outcome: "pending",
    blocked_reason: null,
    blocked_since: null,
  };
}

export function buildColumnMovePatch(column: TaskFrontmatter["column"]): TaskLifecyclePatch {
  const status = statusForColumn(column);
  const isReviewColumn = column === "review";

  return {
    column,
    status,
    approval_needed: isReviewColumn,
    approval_requested_by: null,
    approval_reason: null,
    approved_by: null,
    approved_at: null,
    approval_outcome: "pending",
    blocked_reason: null,
    blocked_since: null,
  };
}

export function getAdjacentTaskColumns(column: TaskFrontmatter["column"]): TaskColumnMovePair {
  const currentIndex = taskColumnOrder.indexOf(column);

  if (currentIndex === -1) {
    return {
      previous: null,
      next: null,
    };
  }

  return {
    previous: toColumnMoveOption(taskColumnOrder[currentIndex - 1]),
    next: toColumnMoveOption(taskColumnOrder[currentIndex + 1]),
  };
}
