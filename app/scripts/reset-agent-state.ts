import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { assertAgentFrontmatter, type AgentFrontmatter } from "../shared/vault/schema";
import { normalizeAgentFrontmatterState } from "../server/services/vault/agent-state-normalizer";
import { resolveVaultWorkspaceRoot } from "../server/services/vault/runtime";

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
	if (lines[0] !== "---") throw new Error("Agent document must start with YAML frontmatter.");
	const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
	if (closingIndex === -1) throw new Error("Agent document is missing a closing frontmatter fence.");
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

function stringifyValue(value: unknown): string {
	if (value === null) return "null";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return JSON.stringify(value);
}

function serializeAgentDocument(frontmatter: AgentFrontmatter, body: string): string {
	const lines = [
		`id: ${stringifyValue(frontmatter.id)}`,
		`type: ${frontmatter.type}`,
		`name: ${stringifyValue(frontmatter.name)}`,
		...(frontmatter.account_id === undefined ? [] : [`account_id: ${stringifyValue(frontmatter.account_id)}`]),
		`role: ${stringifyValue(frontmatter.role)}`,
		`roles: ${stringifyValue(frontmatter.roles)}`,
		`provider: ${stringifyValue(frontmatter.provider)}`,
		...(frontmatter.api_key_ref === undefined ? [] : [`api_key_ref: ${stringifyValue(frontmatter.api_key_ref)}`]),
		...(frontmatter.portrait_asset === undefined ? [] : [`portrait_asset: ${stringifyValue(frontmatter.portrait_asset)}`]),
		...(frontmatter.sprite_asset === undefined ? [] : [`sprite_asset: ${stringifyValue(frontmatter.sprite_asset)}`]),
		`model: ${stringifyValue(frontmatter.model)}`,
		...(frontmatter.fallback_models === undefined ? [] : [`fallback_models: ${stringifyValue(frontmatter.fallback_models)}`]),
		...(frontmatter.monthly_budget_usd === undefined ? [] : [`monthly_budget_usd: ${stringifyValue(frontmatter.monthly_budget_usd)}`]),
		...(frontmatter.aliases === undefined ? [] : [`aliases: ${stringifyValue(frontmatter.aliases)}`]),
		...(frontmatter.runtime_kind === undefined ? [] : [`runtime_kind: ${stringifyValue(frontmatter.runtime_kind)}`]),
		...(frontmatter.run_command === undefined ? [] : [`run_command: ${stringifyValue(frontmatter.run_command)}`]),
		...(frontmatter.command_template === undefined ? [] : [`command_template: ${stringifyValue(frontmatter.command_template)}`]),
		...(frontmatter.run_mode === undefined ? [] : [`run_mode: ${stringifyValue(frontmatter.run_mode)}`]),
		...(frontmatter.webhook_url === undefined ? [] : [`webhook_url: ${stringifyValue(frontmatter.webhook_url)}`]),
		...(frontmatter.working_directory_strategy === undefined ? [] : [`working_directory_strategy: ${stringifyValue(frontmatter.working_directory_strategy)}`]),
		...(frontmatter.supports_resume === undefined ? [] : [`supports_resume: ${stringifyValue(frontmatter.supports_resume)}`]),
		...(frontmatter.supports_streaming === undefined ? [] : [`supports_streaming: ${stringifyValue(frontmatter.supports_streaming)}`]),
		...(frontmatter.bootstrap_strategy === undefined ? [] : [`bootstrap_strategy: ${stringifyValue(frontmatter.bootstrap_strategy)}`]),
		...(frontmatter.verification_status === undefined ? [] : [`verification_status: ${stringifyValue(frontmatter.verification_status)}`]),
		`capabilities: ${stringifyValue(frontmatter.capabilities)}`,
		`task_types_accepted: ${stringifyValue(frontmatter.task_types_accepted)}`,
		`approval_required_for: ${stringifyValue(frontmatter.approval_required_for)}`,
		`cannot_do: ${stringifyValue(frontmatter.cannot_do)}`,
		`accessible_by: ${stringifyValue(frontmatter.accessible_by)}`,
		`skill_file: ${stringifyValue(frontmatter.skill_file)}`,
		...(frontmatter.skill_files === undefined ? [] : [`skill_files: ${stringifyValue(frontmatter.skill_files)}`]),
		`status: ${stringifyValue(frontmatter.status)}`,
		`workspace_id: ${stringifyValue(frontmatter.workspace_id)}`,
		`created_at: ${stringifyValue(frontmatter.created_at)}`,
		`updated_at: ${stringifyValue(frontmatter.updated_at)}`,
	];

	const bodySuffix = body.length > 0 ? `\n${body}` : "";
	return `---\n${lines.join("\n")}\n---${bodySuffix}`;
}

function toNullableString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function toStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function toNullableNumber(value: unknown): number | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function coerceAgentFrontmatter(record: Record<string, unknown>): AgentFrontmatter {
	const agent = omitUndefined({
		...record,
		account_id: record.account_id === undefined ? undefined : toNullableString(record.account_id),
		api_key_ref: record.api_key_ref === undefined ? undefined : toNullableString(record.api_key_ref),
		portrait_asset: record.portrait_asset === undefined ? undefined : toNullableString(record.portrait_asset),
		sprite_asset: record.sprite_asset === undefined ? undefined : toNullableString(record.sprite_asset),
		fallback_models: record.fallback_models === undefined ? undefined : toStringArray(record.fallback_models),
		monthly_budget_usd: toNullableNumber(record.monthly_budget_usd),
		aliases: record.aliases === undefined ? undefined : toStringArray(record.aliases),
		runtime_kind: record.runtime_kind === undefined ? undefined : toNullableString(record.runtime_kind) ?? undefined,
		run_command: record.run_command === undefined ? undefined : toNullableString(record.run_command) ?? undefined,
		command_template: record.command_template === undefined ? undefined : toNullableString(record.command_template) ?? undefined,
		run_mode: record.run_mode === undefined ? undefined : toNullableString(record.run_mode) ?? undefined,
		webhook_url: record.webhook_url === undefined ? undefined : toNullableString(record.webhook_url) ?? undefined,
		working_directory_strategy: record.working_directory_strategy === undefined ? undefined : toNullableString(record.working_directory_strategy) ?? undefined,
		supports_resume: typeof record.supports_resume === "boolean" ? record.supports_resume : undefined,
		supports_streaming: typeof record.supports_streaming === "boolean" ? record.supports_streaming : undefined,
		bootstrap_strategy: record.bootstrap_strategy === undefined ? undefined : toNullableString(record.bootstrap_strategy) ?? undefined,
		verification_status: record.verification_status === undefined ? undefined : toNullableString(record.verification_status) ?? undefined,
		roles: toStringArray(record.roles),
		capabilities: toStringArray(record.capabilities),
		task_types_accepted: toStringArray(record.task_types_accepted),
		approval_required_for: toStringArray(record.approval_required_for),
		cannot_do: toStringArray(record.cannot_do),
		accessible_by: toStringArray(record.accessible_by),
		skill_files: record.skill_files === undefined ? undefined : toStringArray(record.skill_files),
	}) as unknown as AgentFrontmatter;

	assertAgentFrontmatter(normalizeAgentFrontmatterState(agent));
	return agent;
}

async function main() {
	const apply = process.argv.includes("--apply");
	const vaultRoot = resolveVaultWorkspaceRoot();
	const agentDir = join(vaultRoot, "vault", "shared", "agents");
	const entries = await readdir(agentDir, { withFileTypes: true });
	let changed = 0;

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		const filePath = join(agentDir, entry.name);
		const raw = await readFile(filePath, "utf8");
		const { frontmatter, body } = splitDocument(raw);
		const agent = coerceAgentFrontmatter(parseFrontmatter(frontmatter));
		const normalized = normalizeAgentFrontmatterState(agent, Number.isNaN(Date.parse(agent.updated_at)) ? new Date() : new Date(agent.updated_at));
		const nextRaw = serializeAgentDocument(normalized, body);
		if (JSON.stringify(agent) === JSON.stringify(normalized)) continue;
		changed += 1;
		if (apply) {
			await writeFile(filePath, nextRaw, "utf8");
		}
	}

	console.log(JSON.stringify({ vaultRoot, apply, changed }, null, 2));
}

await main();
