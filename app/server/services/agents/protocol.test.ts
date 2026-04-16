import { describe, expect, test } from "bun:test";

import type { TaskFrontmatter } from "../../../shared/vault/schema";
import { buildTaskSelection, selectReadyTasks, selectReadyTasksForCaller } from "./protocol";

function createTask(overrides: Partial<TaskFrontmatter> = {}): TaskFrontmatter {
  return {
    id: "task-001",
    type: "task",
    version: 1,
    workspace_id: "ws-acme",
    project_id: "project-alpha",
    board_id: "board-alpha",
    column: "todo",
    status: "todo",
    priority: "high",
    title: "Ready task",
    assignee: "agent-alpha",
    created_by: "@alice",
    created_at: "2026-04-14T10:00:00Z",
    updated_at: "2026-04-14T10:00:00Z",
    heartbeat_at: null,
    execution_started_at: null,
    execution_notes: null,
    progress: 0,
    approval_needed: false,
    approval_requested_by: null,
    approval_reason: null,
    approved_by: null,
    approved_at: null,
    approval_outcome: "pending",
    blocked_reason: null,
    blocked_since: null,
    result: null,
    completed_at: null,
    parent_task_id: null,
    depends_on: [],
    tags: [],
    links: [],
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  };
}

describe("agent protocol task selection", () => {
  test("returns only caller-owned tasks with satisfied dependencies", () => {
    const tasks = [
      createTask({ id: "task-001", status: "done" }),
      createTask({ id: "task-002", depends_on: ["task-001"] }),
      createTask({ id: "task-003", depends_on: ["task-missing"] }),
      createTask({ id: "task-004", assignee: "agent-beta" }),
      createTask({ id: "task-005", status: "in-progress" }),
      createTask({ id: "task-006", locked_by: "agent-beta", locked_at: "2026-04-14T09:00:00Z", lock_expires_at: "2026-04-14T13:00:00Z" }),
      createTask({ id: "task-007", status: "cancelled" }),
    ];

    const readyTasks = selectReadyTasks(tasks, "agent-alpha");

    expect(readyTasks.map((task) => task.id)).toEqual(["task-002", "task-005"]);
  });

  test("wraps the ready tasks in a selection record", () => {
    const tasks = [createTask({ id: "task-001", status: "done" }), createTask({ id: "task-002", depends_on: ["task-001"] })];

    const selection = buildTaskSelection(tasks, "agent-alpha");

    expect(selection.callerId).toBe("agent-alpha");
    expect(selection.assignee).toBe("agent-alpha");
    expect(selection.readyTasks.map((task) => task.id)).toEqual(["task-002"]);
  });

  test("keeps ready-task selection inside the caller/assignee boundary", () => {
    const tasks = [createTask({ id: "task-001", status: "done" }), createTask({ id: "task-002", depends_on: ["task-001"] })];

    const readyTasks = selectReadyTasksForCaller({ callerId: "agent-alpha", assignee: "agent-beta", tasks });

    expect(readyTasks).toEqual([]);
  });
});
