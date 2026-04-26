import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { patchVaultAgent } from "./[id].patch";

describe("PATCH /api/vault/agents/:id", () => {
  test("updates editable agent fields in place", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-agent-patch-"));
    try {
      await mkdir(join(root, "vault", "shared", "agents"), { recursive: true });
      await writeFile(join(root, "vault", "shared", "agents", "agent-claude-code.md"), [
        "---",
        'id: "agent-claude-code"',
        'type: "agent"',
        'name: "Claude Code"',
        'role: "implementation"',
        'roles: ["implementation"]',
        'provider: "claude"',
        'model: "claude-sonnet-4-6"',
        'aliases: ["claude-operator"]',
        'run_command: "bun run ./cli/relayhq.ts run --taskId={taskId}"',
        'run_mode: "subprocess"',
        'capabilities: ["write-code"]',
        'task_types_accepted: []',
        'approval_required_for: []',
        'cannot_do: []',
        'accessible_by: []',
        'skill_file: "skills/claude-code.md"',
        'status: "available"',
        'workspace_id: "ws-demo"',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T00:00:00Z"',
        "---",
      ].join("\n"), "utf8");

      const response = await patchVaultAgent("agent-claude-code", { patch: { name: "Claude Operator", aliases: ["operator", "coder"], run_command: "bun run ./cli/relayhq.ts run --taskId={taskId}", run_mode: "webhook", capabilities: ["write-code", "run-tests"], approval_required_for: ["deploy"] } }, { vaultRoot: root });
      expect(response.success).toBe(true);

      const content = await readFile(join(root, "vault", "shared", "agents", "agent-claude-code.md"), "utf8");
      expect(content).toContain('name: "Claude Operator"');
      expect(content).toContain('aliases: ["operator","coder"]');
      expect(content).toContain('run_command: "bun run ./cli/relayhq.ts run --taskId={taskId}"');
      expect(content).toContain('run_mode: "webhook"');
      expect(content).toContain('capabilities: ["write-code","run-tests"]');
      expect(content).toContain('approval_required_for: ["deploy"]');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
