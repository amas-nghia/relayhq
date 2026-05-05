import { describe, expect, test } from "bun:test";

import type { AgentFrontmatter } from "../../../shared/vault/schema";
import { normalizeAgentFrontmatterState } from "./agent-state-normalizer";

function createAgent(overrides: Partial<AgentFrontmatter> = {}): AgentFrontmatter {
	return {
		id: "agent-1",
		type: "agent",
		name: "Agent One",
		role: "implementation",
		roles: ["implementation"],
		provider: "openai",
		model: "gpt-5.5",
		capabilities: [],
		task_types_accepted: [],
		approval_required_for: [],
		cannot_do: [],
		accessible_by: [],
		skill_file: "skills/implementation.md",
		status: "busy",
		workspace_id: "ws-demo",
		created_at: "2026-04-30T10:00:00.000Z",
		updated_at: "2026-04-30T10:00:00.000Z",
		...overrides,
	};
}

describe("normalizeAgentFrontmatterState", () => {
	test("normalizes stateful fields back to registry-safe defaults", () => {
		const normalized = normalizeAgentFrontmatterState(createAgent({
			roles: ["implementation", "implementation", "review"],
			aliases: ["beta", "alpha", "alpha"],
			capabilities: ["write-code", "write-code", "run-tests"],
			status: "offline",
			verification_status: undefined,
		}))

		expect(normalized.status).toBe("available")
		expect(normalized.verification_status).toBe("unknown")
		expect(normalized.roles).toEqual(["implementation", "review"])
		expect(normalized.aliases).toEqual(["alpha", "beta"])
		expect(normalized.capabilities).toEqual(["run-tests", "write-code"])
	})
})
