import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { TaskFrontmatter } from "../shared/vault/schema";
import { normalizeDoneTaskFrontmatter, resetTodoTaskFrontmatter } from "../server/services/vault/task-state-normalizer";
import { resolveVaultWorkspaceRoot } from "../server/services/vault/runtime";
import { serializeTaskDocument } from "../server/services/vault/write";

function parseValue(value: string): unknown {
	const trimmed = value.trim();
	if (trimmed === "null") return null;
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
	if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) return JSON.parse(trimmed);
	if (trimmed.startsWith('"') && trimmed.endsWith('"')) return JSON.parse(trimmed);
	return trimmed;
}

function splitDocument(content: string): { frontmatter: string; body: string } {
	const lines = content.split(/\r?\n/);
	if (lines[0] !== "---") throw new Error("Task document must start with YAML frontmatter.");
	const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
	if (closingIndex === -1) throw new Error("Task document is missing a closing frontmatter fence.");
	return {
		frontmatter: lines.slice(1, closingIndex).join("\n"),
		body: lines.slice(closingIndex + 1).join("\n"),
	};
}

function parseFrontmatter(frontmatter: string): Record<string, unknown> {
	const record: Record<string, unknown> = {};
	for (const line of frontmatter.split(/\r?\n/)) {
		if (line.trim().length === 0) continue;
		const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
		if (!match) continue;
		record[match[1]] = parseValue(match[2]);
	}
	return record;
}

function toNullableString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function toStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function coerceTaskFrontmatter(record: Record<string, unknown>): TaskFrontmatter {
	return {
		...record,
		heartbeat_at: toNullableString(record.heartbeat_at),
		execution_started_at: toNullableString(record.execution_started_at),
		execution_notes: toNullableString(record.execution_notes),
		next_run_at: record.next_run_at === undefined ? null : toNullableString(record.next_run_at),
		cron_schedule: record.cron_schedule === undefined ? null : toNullableString(record.cron_schedule),
		dispatch_status: record.dispatch_status === undefined ? null : record.dispatch_status,
		dispatch_reason: record.dispatch_reason === undefined ? null : toNullableString(record.dispatch_reason),
		last_dispatch_attempt_at: record.last_dispatch_attempt_at === undefined ? null : toNullableString(record.last_dispatch_attempt_at),
		approval_requested_by: toNullableString(record.approval_requested_by),
		approval_reason: toNullableString(record.approval_reason),
		approved_by: toNullableString(record.approved_by),
		approved_at: toNullableString(record.approved_at),
		blocked_reason: toNullableString(record.blocked_reason),
		blocked_since: toNullableString(record.blocked_since),
		result: toNullableString(record.result),
		completed_at: toNullableString(record.completed_at),
		parent_task_id: toNullableString(record.parent_task_id),
		source_issue_id: record.source_issue_id === undefined ? null : toNullableString(record.source_issue_id),
		github_issue_id: record.github_issue_id === undefined ? null : toNullableString(record.github_issue_id),
		depends_on: toStringArray(record.depends_on),
		tags: toStringArray(record.tags),
		links: Array.isArray(record.links) ? record.links : [],
		locked_by: toNullableString(record.locked_by),
		locked_at: toNullableString(record.locked_at),
		lock_expires_at: toNullableString(record.lock_expires_at),
		progress: typeof record.progress === "number" && Number.isFinite(record.progress) ? record.progress : 0,
	} as unknown as TaskFrontmatter;
}

async function main() {
	const apply = process.argv.includes("--apply");
	const vaultRoot = resolveVaultWorkspaceRoot();
	const taskDir = join(vaultRoot, "vault", "shared", "tasks");
	const entries = await readdir(taskDir, { withFileTypes: true });
	const now = new Date();

	let todoReset = 0;
	let doneNormalized = 0;
	let unchanged = 0;

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		const filePath = join(taskDir, entry.name);
		const raw = await readFile(filePath, "utf8");
		const { frontmatter, body } = splitDocument(raw);
		const task = coerceTaskFrontmatter(parseFrontmatter(frontmatter));
		const taskNow = Number.isNaN(Date.parse(task.updated_at)) ? now : new Date(task.updated_at);

		const next = task.column === "todo"
			? resetTodoTaskFrontmatter(task, taskNow)
			: task.column === "done"
				? normalizeDoneTaskFrontmatter(task, taskNow)
				: task;

		const nextRaw = serializeTaskDocument(next, body);
		if (nextRaw === raw) {
			unchanged += 1;
			continue;
		}

		if (task.column === "todo") todoReset += 1;
		if (task.column === "done") doneNormalized += 1;

		if (apply) {
			await writeFile(filePath, nextRaw, "utf8");
		}
	}

	console.log(JSON.stringify({ vaultRoot, apply, todoReset, doneNormalized, unchanged }, null, 2));
}

await main();
