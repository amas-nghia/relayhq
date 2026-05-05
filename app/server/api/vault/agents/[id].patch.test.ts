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

      const response = await patchVaultAgent("agent-claude-code", { patch: { name: "Claude Operator", model: "gpt-5.4", aliases: ["operator", "coder"], run_command: "bun run ./cli/relayhq.ts run --taskId={taskId}", run_mode: "webhook", capabilities: ["write-code", "run-tests"], approval_required_for: ["deploy"], skill_file: "skills/worker-terse.md", skill_files: ["skills/worker-terse.md"], body: "# Claude Operator\n\nTalk less. Keep technical signal high." } }, { vaultRoot: root });
      expect(response.success).toBe(true);

      const content = await readFile(join(root, "vault", "shared", "agents", "agent-claude-code.md"), "utf8");
      expect(content).toContain('name: "Claude Operator"');
      expect(content).toContain('model: "gpt-5.4"');
      expect(content).toContain('aliases: ["operator","coder"]');
      expect(content).toContain('run_command: "bun run ./cli/relayhq.ts run --taskId={taskId}"');
      expect(content).toContain('run_mode: "webhook"');
      expect(content).toContain('capabilities: ["write-code","run-tests"]');
      expect(content).toContain('approval_required_for: ["deploy"]');
      expect(content).toContain('skill_file: "skills/worker-terse.md"');
      expect(content).toContain('skill_files: ["skills/worker-terse.md"]');
      expect(content).toContain('# Claude Operator\n\nTalk less. Keep technical signal high.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("stops live runners when launch-affecting fields change", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-agent-patch-runners-"));
    const stoppedSessions: string[] = [];
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

      await patchVaultAgent("agent-claude-code", { patch: { model: "gpt-5.4" } }, {
        vaultRoot: root,
        runnerManager: {
          getAgentRunners: () => ([{ sessionId: "runner-1" }] as never),
          stopRunner: (sessionId: string) => {
            stoppedSessions.push(sessionId)
            return true
          },
        },
      });

      expect(stoppedSessions).toEqual(["runner-1"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("clears coordinator thread active session when coordinator config changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-agent-patch-thread-"));
    try {
      await mkdir(join(root, "vault", "shared", "agents"), { recursive: true });
      await mkdir(join(root, "vault", "shared", "projects"), { recursive: true });
      await mkdir(join(root, "vault", "shared", "coordinator-threads"), { recursive: true });
      await writeFile(join(root, "vault", "shared", "agents", "agent-coordinator.md"), [
        "---",
        'id: "agent-coordinator"',
        'type: "agent"',
        'name: "Coordinator"',
        'role: "coordinator"',
        'roles: ["coordinator"]',
        'provider: "anthropic"',
        'model: "claude-sonnet-4-6"',
        'run_mode: "subprocess"',
        'capabilities: ["write-code"]',
        'task_types_accepted: []',
        'approval_required_for: []',
        'cannot_do: []',
        'accessible_by: []',
        'skill_file: "skills/coordinator.md"',
        'status: "available"',
        'workspace_id: "ws-demo"',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T00:00:00Z"',
        "---",
      ].join("\n"), "utf8");
      await writeFile(join(root, "vault", "shared", "projects", "project-demo.md"), [
        "---",
        'id: "project-demo"',
        'type: "project"',
        'workspace_id: "ws-demo"',
        'name: "Demo Project"',
        'coordinator_agent_id: "agent-coordinator"',
        'codebases: []',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T00:00:00Z"',
        "---",
      ].join("\n"), "utf8");
      await writeFile(join(root, "vault", "shared", "coordinator-threads", "coordinator-thread-project-demo.md"), [
        "---",
        'id: "coordinator-thread-project-demo"',
        'type: "coordinator-thread"',
        'workspace_id: "ws-demo"',
        'project_id: "project-demo"',
        'coordinator_agent_id: "agent-coordinator"',
        'active_session_id: "runner-old"',
        'status: "active"',
        'created_at: "2026-04-24T00:00:00Z"',
        'updated_at: "2026-04-24T00:00:00Z"',
        "---",
        "# Demo Project Coordinator Thread",
      ].join("\n"), "utf8");

      await patchVaultAgent("agent-coordinator", { patch: { model: "gpt-5.4" } }, { vaultRoot: root });

      const content = await readFile(join(root, "vault", "shared", "coordinator-threads", "coordinator-thread-project-demo.md"), "utf8");
      expect(content).toContain('active_session_id: null');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
