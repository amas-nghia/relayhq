import { describe, expect, test } from "bun:test";

import { readAuditNotes } from "./audit-notes.get";

describe("GET /api/vault/audit-notes", () => {
  test("returns audit notes sorted by createdAt descending", async () => {
    const calls: Array<string> = [];
    const readModelReader = async (vaultRoot: string) => {
      calls.push(vaultRoot);

      return {
        workspaces: [],
        projects: [],
        boards: [],
        columns: [],
        tasks: [],
        issues: [],
        approvals: [],
        auditNotes: [
        {
          id: "audit-001",
          type: "audit-note" as const,
          taskId: "task-001",
          message: "Older note",
          source: "relayhq-ui",
          confidence: 0.6,
          promptTokens: 120,
          completionTokens: 45,
          tokensUsed: 165,
          model: "claude-sonnet-4-6",
          costUsd: 0.001,
          usageSource: "estimated" as const,
          createdAt: "2026-04-20T09:00:00Z",
          sourcePath: "vault/shared/audit/audit-001.md",
        },
        {
          id: "audit-002",
          type: "audit-note" as const,
          taskId: "task-002",
          message: "Newest note",
          source: "kioku-sync",
          confidence: 0.9,
          promptTokens: null,
          completionTokens: null,
          tokensUsed: 420,
          model: "gpt-5.4",
          costUsd: 0.012,
          usageSource: "runtime" as const,
          createdAt: "2026-04-20T10:00:00Z",
          sourcePath: "vault/shared/audit/audit-002.md",
        },
      ],
        docs: [],
        agents: [],
      };
    };

    const response = await readAuditNotes({
      readModelReader,
      resolveRoot: () => "/tmp/relayhq-vault",
      workspaceIdReader: () => null,
    });

    expect(calls).toEqual(["/tmp/relayhq-vault"]);
    expect(response).toEqual({
      auditNotes: [
        {
          id: "audit-002",
          taskId: "task-002",
          message: "Newest note",
          source: "kioku-sync",
          confidence: 0.9,
          promptTokens: null,
          completionTokens: null,
          tokensUsed: 420,
          model: "gpt-5.4",
          costUsd: 0.012,
          usageSource: "runtime",
          createdAt: "2026-04-20T10:00:00Z",
          sourcePath: "vault/shared/audit/audit-002.md",
        },
        {
          id: "audit-001",
          taskId: "task-001",
          message: "Older note",
          source: "relayhq-ui",
          confidence: 0.6,
          promptTokens: 120,
          completionTokens: 45,
          tokensUsed: 165,
          model: "claude-sonnet-4-6",
          costUsd: 0.001,
          usageSource: "estimated",
          createdAt: "2026-04-20T09:00:00Z",
          sourcePath: "vault/shared/audit/audit-001.md",
        },
      ],
    });
  });

  test("returns an empty array when the vault has no audit notes", async () => {
    const response = await readAuditNotes({
      readModelReader: async () => ({
        workspaces: [],
        projects: [],
        boards: [],
        columns: [],
        tasks: [],
        issues: [],
        approvals: [],
        auditNotes: [],
        docs: [],
        agents: [],
      }),
      resolveRoot: () => "/tmp/relayhq-vault",
      workspaceIdReader: () => null,
    });

    expect(response).toEqual({ auditNotes: [] });
  });
});
