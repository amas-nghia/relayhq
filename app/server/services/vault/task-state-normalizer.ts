import { assertTaskFrontmatter, type TaskDispatchStatus, type TaskFrontmatter } from "../../../shared/vault/schema";
import { getTaskLockState } from "./lock";

function isAssigned(assignee: string | null | undefined): assignee is string {
	return typeof assignee === "string" && assignee.trim().length > 0 && assignee !== "unassigned";
}

function isDispatchStatus(value: unknown): value is TaskDispatchStatus {
	return value === "idle" || value === "checking" || value === "ready" || value === "started" || value === "blocked" || value === "failed";
}

function normalizeProgress(task: TaskFrontmatter): number {
	if (typeof task.progress === "number" && Number.isFinite(task.progress)) {
		return Math.max(0, Math.min(100, Math.round(task.progress)));
	}

	if (task.status === "review" || task.status === "done") return 100;
	return 0;
}

function normalizeDispatch(task: TaskFrontmatter): Pick<TaskFrontmatter, "dispatch_status" | "dispatch_reason" | "last_dispatch_attempt_at"> {
	if (!isAssigned(task.assignee)) {
		return {
			dispatch_status: "idle",
			dispatch_reason: null,
			last_dispatch_attempt_at: null,
		};
	}

	if (task.status === "todo") {
		return {
			dispatch_status: isDispatchStatus(task.dispatch_status) ? task.dispatch_status : "checking",
			dispatch_reason: typeof task.dispatch_reason === "string" && task.dispatch_reason.trim().length > 0
				? task.dispatch_reason
				: "Assigned and waiting for dispatcher evaluation.",
			last_dispatch_attempt_at: typeof task.last_dispatch_attempt_at === "string" ? task.last_dispatch_attempt_at : task.updated_at,
		};
	}

	if (task.status === "in-progress") {
		return {
			dispatch_status: "started",
			dispatch_reason: typeof task.dispatch_reason === "string" && task.dispatch_reason.trim().length > 0
				? task.dispatch_reason
				: "Execution claimed by the assigned agent.",
			last_dispatch_attempt_at: typeof task.last_dispatch_attempt_at === "string" ? task.last_dispatch_attempt_at : task.updated_at,
		};
	}

	if (task.status === "blocked" || task.status === "waiting-approval") {
		return {
			dispatch_status: "blocked",
			dispatch_reason: typeof task.dispatch_reason === "string" && task.dispatch_reason.trim().length > 0
				? task.dispatch_reason
				: task.blocked_reason,
			last_dispatch_attempt_at: typeof task.last_dispatch_attempt_at === "string" ? task.last_dispatch_attempt_at : task.updated_at,
		};
	}

	return {
		dispatch_status: "idle",
		dispatch_reason: null,
		last_dispatch_attempt_at: typeof task.last_dispatch_attempt_at === "string" ? task.last_dispatch_attempt_at : null,
	};
}

export function resetTodoTaskFrontmatter(task: TaskFrontmatter, now: Date = new Date()): TaskFrontmatter {
	const normalized: TaskFrontmatter = {
		...task,
		column: "todo",
		status: "todo",
		heartbeat_at: null,
		execution_started_at: null,
		execution_notes: null,
		progress: 0,
		next_run_at: null,
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
		tokens_used: null,
		model: null,
		cost_usd: null,
		locked_by: null,
		locked_at: null,
		lock_expires_at: null,
		updated_at: now.toISOString(),
	};

	return normalizeTaskFrontmatterState(normalized, now);
}

export function normalizeDoneTaskFrontmatter(task: TaskFrontmatter, now: Date = new Date()): TaskFrontmatter {
	const normalized: TaskFrontmatter = {
		...task,
		column: "done",
		status: "done",
		progress: 100,
		approval_needed: false,
		blocked_reason: null,
		blocked_since: null,
		locked_by: null,
		locked_at: null,
		lock_expires_at: null,
		completed_at: typeof task.completed_at === "string" ? task.completed_at : now.toISOString(),
		updated_at: now.toISOString(),
	};

	return normalizeTaskFrontmatterState(normalized, now);
}

export function normalizeTaskFrontmatterState(
	task: TaskFrontmatter,
	now: Date = new Date(),
): TaskFrontmatter {
	const lockState = getTaskLockState(task, now);
	const dispatch = normalizeDispatch(task);

	const normalized: TaskFrontmatter = {
		...task,
		heartbeat_at: typeof task.heartbeat_at === "string" ? task.heartbeat_at : null,
		execution_started_at: typeof task.execution_started_at === "string" ? task.execution_started_at : null,
		execution_notes: typeof task.execution_notes === "string" ? task.execution_notes : null,
		progress: normalizeProgress(task),
		completed_at: task.status === "review" || task.status === "done"
			? (typeof task.completed_at === "string" ? task.completed_at : task.updated_at)
			: null,
		locked_by: lockState.mode === "stale" ? null : task.locked_by,
		locked_at: lockState.mode === "stale" ? null : task.locked_at,
		lock_expires_at: lockState.mode === "stale" ? null : task.lock_expires_at,
		...dispatch,
	};

	assertTaskFrontmatter(normalized);
	return normalized;
}
