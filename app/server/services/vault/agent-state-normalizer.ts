import { assertAgentFrontmatter, type AgentFrontmatter } from "../../../shared/vault/schema";

function uniqueSorted(values: ReadonlyArray<string> | undefined, fallback: ReadonlyArray<string> = []): ReadonlyArray<string> {
	return [...new Set((values ?? fallback).map((entry) => entry.trim()).filter((entry) => entry.length > 0))].sort((left, right) => left.localeCompare(right));
}

export function normalizeAgentFrontmatterState(agent: AgentFrontmatter, now: Date = new Date()): AgentFrontmatter {
	const roles = uniqueSorted(agent.roles, [agent.role]);
	const normalized: AgentFrontmatter = {
		...agent,
		roles: roles.length > 0 ? roles : [agent.role],
		aliases: uniqueSorted(agent.aliases),
		fallback_models: uniqueSorted(agent.fallback_models),
		capabilities: uniqueSorted(agent.capabilities),
		task_types_accepted: uniqueSorted(agent.task_types_accepted),
		approval_required_for: uniqueSorted(agent.approval_required_for),
		cannot_do: uniqueSorted(agent.cannot_do),
		accessible_by: uniqueSorted(agent.accessible_by),
		skill_files: uniqueSorted(agent.skill_files),
		status: "available",
		verification_status: agent.verification_status ?? "unknown",
		updated_at: Number.isNaN(Date.parse(agent.updated_at)) ? now.toISOString() : agent.updated_at,
	};

	assertAgentFrontmatter(normalized);
	return normalized;
}
