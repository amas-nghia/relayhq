export interface TaskInputValidationIssue {
  readonly field: "title" | "objective" | "acceptanceCriteria" | "contextFiles";
  readonly reason: string;
}

export interface TaskInputShape {
  readonly title?: string;
  readonly objective?: string;
  readonly acceptanceCriteria?: ReadonlyArray<string>;
  readonly contextFiles?: ReadonlyArray<string>;
}

export function validateTaskInput(input: TaskInputShape): ReadonlyArray<TaskInputValidationIssue> {
  const issues: TaskInputValidationIssue[] = [];

  if (typeof input.title !== "string" || input.title.trim().length === 0) {
    issues.push({ field: "title", reason: "must be a non-empty string" });
  }

  const objectiveLength = typeof input.objective === "string" ? input.objective.trim().length : 0;
  if (objectiveLength < 50) {
    issues.push({ field: "objective", reason: "must be at least 50 characters" });
  }

  if (!Array.isArray(input.acceptanceCriteria) || input.acceptanceCriteria.length < 2) {
    issues.push({ field: "acceptanceCriteria", reason: "must contain at least 2 items" });
  }

  if (!Array.isArray(input.contextFiles) || input.contextFiles.length === 0) {
    issues.push({ field: "contextFiles", reason: "must contain at least 1 item" });
  }

  return issues;
}

export function formatTaskInputIssues(issues: ReadonlyArray<TaskInputValidationIssue>): string {
  return issues.map((issue) => `${issue.field}: ${issue.reason}`).join(", ");
}
