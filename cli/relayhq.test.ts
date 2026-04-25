import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { executeRelayHQInvocation, resolveRelayHQBaseUrl } from "./relayhq";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("relayhq CLI config resolution", () => {
  test("walks up directories to find .relayhq base url", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-cli-config-"));
    roots.push(root);
    const nested = join(root, "packages", "demo");
    await mkdir(nested, { recursive: true });
    await writeFile(join(root, ".relayhq"), "RELAYHQ_BASE_URL=http://127.0.0.1:4010\nRELAYHQ_VAULT_ROOT=/tmp/vault\n", "utf8");

    const previousCwd = process.cwd();
    process.chdir(nested);
    try {
      await expect(resolveRelayHQBaseUrl(["tasks"], {})).resolves.toBe("http://127.0.0.1:4010");
    } finally {
      process.chdir(previousCwd);
    }
  });

  test("init writes .relayhq from /api/settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-cli-init-"));
    roots.push(root);
    const previousCwd = process.cwd();
    const originalFetch = globalThis.fetch;
    process.chdir(root);
    globalThis.fetch = (async () => new Response(JSON.stringify({ vaultRoot: "/tmp/demo-vault", resolvedRoot: "/tmp/demo-vault" }), { status: 200 })) as typeof fetch;

    try {
      const client = {
        listTasks: async () => [],
        claimTask: async () => undefined,
        updateTaskStatus: async () => undefined,
        sendHeartbeat: async () => undefined,
        requestApproval: async () => undefined,
      };
      const result = await executeRelayHQInvocation(client, ["init"]);
      expect(result.command).toBe("init");
      await expect(readFile(join(root, ".relayhq"), "utf8")).resolves.toContain("RELAYHQ_VAULT_ROOT=/tmp/demo-vault");
    } finally {
      process.chdir(previousCwd);
      globalThis.fetch = originalFetch;
    }
  });

  test("sync --github creates tasks for unseen issues and skips existing ones", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];

    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);

      if (url.endsWith('/api/vault/read-model')) {
        return new Response(JSON.stringify({
          workspaces: [],
          projects: [{ id: 'project-demo', type: 'project', workspaceId: 'ws-demo', name: 'Demo', codebases: [], boardIds: ['board-demo'], columnIds: ['todo'], taskIds: [], approvalIds: [], createdAt: '2026', updatedAt: '2026', body: '', sourcePath: '' }],
          boards: [{ id: 'board-demo', type: 'board', workspaceId: 'ws-demo', projectId: 'project-demo', name: 'Board', columnIds: ['todo'], taskIds: [], approvalIds: [], createdAt: '2026', updatedAt: '2026', body: '', sourcePath: '' }],
          columns: [{ id: 'todo', type: 'column', workspaceId: 'ws-demo', projectId: 'project-demo', boardId: 'board-demo', name: 'Todo', position: 0, taskIds: [], createdAt: '2026', updatedAt: '2026', body: '', sourcePath: '' }],
          tasks: [{ id: 'task-existing', type: 'task', workspaceId: 'ws-demo', projectId: 'project-demo', boardId: 'board-demo', columnId: 'todo', status: 'todo', priority: 'medium', title: 'Existing', assignee: 'claude-code', createdBy: '@owner', createdAt: '2026', updatedAt: '2026', heartbeatAt: null, executionStartedAt: null, executionNotes: null, progress: 0, approvalNeeded: false, approvalRequestedBy: null, approvalReason: null, approvedBy: null, approvedAt: null, approvalOutcome: 'pending', blockedReason: null, blockedSince: null, result: null, completedAt: null, parentTaskId: null, githubIssueId: '2', dependsOn: [], tags: [], links: [], lockedBy: null, lockedAt: null, lockExpiresAt: null, isStale: false, approvalIds: [], approvalState: { status: 'not-needed', needed: false, outcome: 'pending', requestedBy: null, requestedAt: null, decidedBy: null, decidedAt: null, reason: null }, body: '', sourcePath: '' }],
          issues: [], approvals: [], auditNotes: [], docs: [], agents: [],
        }), { status: 200 });
      }

      if (url.includes('api.github.com')) {
        return new Response(JSON.stringify([
          { number: 1, title: 'First issue', body: 'Issue body', labels: [{ name: 'bug' }], assignees: [] },
          { number: 2, title: 'Existing issue', body: 'Skip me', labels: [], assignees: [] },
        ]), { status: 200 });
      }

      if (url.endsWith('/api/vault/tasks')) {
        return new Response(JSON.stringify({ taskId: 'task-new', boardId: 'board-demo', sourcePath: 'vault/shared/tasks/task-new.md' }), { status: 200 });
      }

      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    try {
      const client = {
        listTasks: async () => [],
        claimTask: async () => undefined,
        updateTaskStatus: async () => undefined,
        sendHeartbeat: async () => undefined,
        requestApproval: async () => undefined,
      };
      const result = await executeRelayHQInvocation(client, ['sync', '--github=owner/repo', '--token=test-token']);
      expect(result).toEqual({ command: 'sync', payload: { created: 1, skipped: 1 } });
      expect(calls.some(call => call.includes('api.github.com/repos/owner/repo/issues'))).toBe(true);
      expect(calls.some(call => call === 'POST http://127.0.0.1:44210/api/vault/tasks')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
