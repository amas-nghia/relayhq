import { describe, expect, test } from "bun:test";

import type { TaskFrontmatter } from "../../../shared/vault/schema";
import { VAULT_SCHEMA_VERSION } from "../../../shared/vault/schema";
import { normalizeDoneTaskFrontmatter, normalizeTaskFrontmatterState, resetTodoTaskFrontmatter } from "./task-state-normalizer";

function createTask(overrides: Partial<TaskFrontmatter> = {}): TaskFrontmatter {
	return {
		id: "task-001",
		type: "task",
		version: VAULT_SCHEMA_VERSION,
		workspace_id: "ws-demo",
		project_id: "project-demo",
		board_id: "board-demo",
		column: "todo",
		status: "todo",
		priority: "high",
		title: "Normalize task state",
		assignee: "agent-1",
		created_by: "@relayhq-web",
		created_at: "2026-04-30T10:00:00.000Z",
		updated_at: "2026-04-30T10:00:00.000Z",
		heartbeat_at: null,
		execution_started_at: null,
		execution_notes: null,
		progress: 0,
		history: [],
		next_run_at: null,
		cron_schedule: null,
		dispatch_status: "checking",
		dispatch_reason: "Assigned and waiting for dispatcher evaluation.",
		last_dispatch_attempt_at: "2026-04-30T10:00:00.000Z",
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

describe("normalizeTaskFrontmatterState", () => {
	test("clears stale locks on todo tasks", () => {
		const normalized = normalizeTaskFrontmatterState(createTask({
			locked_by: "agent-1",
			locked_at: "2026-04-30T09:00:00.000Z",
			lock_expires_at: "2026-04-30T09:05:00.000Z",
			heartbeat_at: "2026-04-30T09:00:00.000Z",
		}), new Date("2026-04-30T10:00:00.000Z"))

		expect(normalized.locked_by).toBeNull()
		expect(normalized.locked_at).toBeNull()
		expect(normalized.lock_expires_at).toBeNull()
	})

	test("normalizes invalid progress based on status", () => {
		const normalized = normalizeTaskFrontmatterState(createTask({
			status: "review",
			column: "review",
			progress: Number.NaN,
			completed_at: null,
		}))

		expect(normalized.progress).toBe(100)
		expect(normalized.completed_at).toBe(normalized.updated_at)
	})

	test("sets non-todo terminal tasks to idle dispatch", () => {
		const normalized = normalizeTaskFrontmatterState(createTask({
			status: "done",
			column: "done",
			dispatch_status: "started",
			dispatch_reason: "Background session started automatically.",
		}))

		expect(normalized.dispatch_status).toBe("idle")
		expect(normalized.dispatch_reason).toBeNull()
	})

	test("resets todo column tasks back to creation-like defaults", () => {
		const normalized = resetTodoTaskFrontmatter(createTask({
			column: "review",
			status: "blocked",
			heartbeat_at: "2026-04-30T09:59:00.000Z",
			execution_started_at: "2026-04-30T09:58:00.000Z",
			execution_notes: "working",
			progress: 55,
			blocked_reason: "Need input",
			result: "partial",
			completed_at: "2026-04-30T09:59:30.000Z",
			tokens_used: 120,
			model: "gpt-5.5",
			cost_usd: 0.12,
			locked_by: "agent-1",
			locked_at: "2026-04-30T09:58:00.000Z",
			lock_expires_at: "2026-04-30T10:03:00.000Z",
		}))

		expect(normalized.column).toBe("todo")
		expect(normalized.status).toBe("todo")
		expect(normalized.progress).toBe(0)
		expect(normalized.execution_started_at).toBeNull()
		expect(normalized.execution_notes).toBeNull()
		expect(normalized.blocked_reason).toBeNull()
		expect(normalized.result).toBeNull()
		expect(normalized.completed_at).toBeNull()
		expect(normalized.locked_by).toBeNull()
	})

	test("normalizes done column tasks to done invariants", () => {
		const normalized = normalizeDoneTaskFrontmatter(createTask({
			column: "todo",
			status: "review",
			progress: 20,
			dispatch_status: "started",
			dispatch_reason: "Background session started automatically.",
			locked_by: "agent-1",
			locked_at: "2026-04-30T09:58:00.000Z",
			lock_expires_at: "2026-04-30T10:03:00.000Z",
			completed_at: null,
		}))

		expect(normalized.column).toBe("done")
		expect(normalized.status).toBe("done")
		expect(normalized.progress).toBe(100)
		expect(normalized.dispatch_status).toBe("idle")
		expect(normalized.dispatch_reason).toBeNull()
		expect(normalized.locked_by).toBeNull()
		expect(typeof normalized.completed_at).toBe("string")
	})
})
