import { describe, expect, test } from "bun:test";

import type { VaultReadModel } from "../../models/read-model";
import { searchAgentDocs } from "./search-docs.post";

function createReadModel(): VaultReadModel {
  return {
    workspaces: [],
    projects: [],
    boards: [],
    columns: [],
    tasks: [],
    issues: [],
    approvals: [],
    auditNotes: [],
    docs: [
      {
        id: "doc-policy",
        type: "doc",
        docType: "policy",
        workspaceId: "ws-demo",
        projectId: "project-demo",
        title: "Deploy policy",
        status: "active",
        visibility: "workspace",
        accessRoles: ["role:implementation"],
        sensitive: false,
        createdAt: "2026-04-24T00:00:00Z",
        updatedAt: "2026-04-24T00:00:00Z",
        tags: ["deploy", "policy"],
        body: "Deploy policy explains how to deploy safely.",
        sourcePath: "vault/shared/docs/doc-policy.md",
      },
      {
        id: "doc-budget",
        type: "doc",
        docType: "budget",
        workspaceId: "ws-demo",
        projectId: "project-demo",
        title: "Deploy budget",
        status: "draft",
        visibility: "workspace",
        accessRoles: ["agent-claude-code"],
        sensitive: true,
        createdAt: "2026-04-24T00:00:00Z",
        updatedAt: "2026-04-24T00:00:00Z",
        tags: ["deploy", "finance"],
        body: "Sensitive deploy spend.",
        sourcePath: "vault/shared/docs/doc-budget.md",
      },
      {
        id: "doc-human",
        type: "doc",
        docType: "policy",
        workspaceId: "ws-demo",
        projectId: "project-demo",
        title: "Human-only policy",
        status: "active",
        visibility: "workspace",
        accessRoles: ["human-only"],
        sensitive: false,
        createdAt: "2026-04-24T00:00:00Z",
        updatedAt: "2026-04-24T00:00:00Z",
        tags: ["deploy"],
        body: "Never expose this doc.",
        sourcePath: "vault/shared/docs/doc-human.md",
      },
      {
        id: "doc-repo-map",
        type: "doc",
        docType: "repo-map",
        workspaceId: "ws-demo",
        projectId: "project-demo",
        title: "RelayHQ repo map",
        status: "active",
        visibility: "project",
        accessRoles: ["all"],
        sensitive: false,
        createdAt: "2026-04-24T00:00:00Z",
        updatedAt: "2026-04-24T00:00:00Z",
        tags: ["codebase-brain", "relayhq"],
        body: "Repo map for approval flow and task lifecycle.",
        sourcePath: "vault/shared/docs/doc-repo-map.md",
      },
    ],
    agents: [
      {
        id: "agent-claude-code",
        type: "agent",
        workspaceId: "ws-demo",
        name: "Claude Code",
        accountId: null,
        role: "implementation",
        roles: ["implementation"],
        provider: "claude",
        apiKeyRef: null,
        portraitAsset: null,
        spriteAsset: null,
        model: "sonnet",
        fallbackModels: [],
        monthlyBudgetUsd: null,
        aliases: [],
        runtimeKind: null,
        runCommand: null,
        commandTemplate: null,
        runMode: null,
        webhookUrl: null,
        workingDirectoryStrategy: null,
        supportsResume: false,
        supportsStreaming: false,
        bootstrapStrategy: null,
        verificationStatus: null,
        capabilities: [],
        taskTypesAccepted: [],
        approvalRequiredFor: [],
        cannotDo: [],
        accessibleBy: [],
        skillFile: "skills/claude-code.md",
        projectId: null,
        status: "available",
        createdAt: "2026-04-24T00:00:00Z",
        updatedAt: "2026-04-24T00:00:00Z",
        body: "",
        sourcePath: "vault/shared/agents/agent-claude-code.md",
      },
    ],
  };
}

describe("POST /api/agent/search-docs", () => {
  test("searches title, tags, and body while respecting doc access rules", async () => {
    const readModel = createReadModel();
    const response = await searchAgentDocs({ query: "deploy", agent_id: "agent-claude-code" }, {
      vaultRoot: "/tmp/relayhq-vault",
      readModel,
    } as never);

    expect(response.docs.map((doc) => doc.id)).toEqual(["doc-policy", "doc-budget"]);
    expect(response.docs[0]?.excerpt.toLowerCase()).toContain("deploy");
    expect(JSON.stringify(response.docs)).not.toContain("doc-human");
    expect(response.docs[0]?.matched_fields).toContain("title");
    expect(response.docs[0]?.score_breakdown.title_terms).toBeGreaterThan(0);
  });

  test("applies types, tags, status, and limit filters", async () => {
    const response = await searchAgentDocs({
      query: "approval flow",
      agent_id: "agent-claude-code",
      types: ["repo-map"],
      tags: ["codebase-brain"],
      status: "active",
      limit: 1,
    }, {
      vaultRoot: "/tmp/relayhq-vault",
      readModel: createReadModel(),
    } as never);

    expect(response.docs).toHaveLength(1);
    expect(response.docs[0]).toMatchObject({
      id: "doc-repo-map",
      type: "repo-map",
    });
    expect(response.docs[0]?.matched_fields).toEqual(expect.arrayContaining(["body"]));
  });

  test("boosts exact title phrase matches over weaker body matches", async () => {
    const base = createReadModel();
    const readModel: VaultReadModel = {
      ...base,
      docs: [
        ...base.docs,
        {
          id: "doc-body-only",
          type: "doc",
          docType: "research",
          workspaceId: "ws-demo",
          projectId: "project-demo",
          title: "Notes",
          status: "active",
          visibility: "project",
          accessRoles: ["all"],
          sensitive: false,
          createdAt: "2026-04-24T00:00:00Z",
          updatedAt: "2026-04-24T00:00:00Z",
          tags: [],
          body: "This body mentions deploy policy once.",
          sourcePath: "vault/shared/docs/doc-body-only.md",
        },
      ],
    };

    const response = await searchAgentDocs({ query: "deploy policy", agent_id: "agent-claude-code" }, {
      vaultRoot: "/tmp/relayhq-vault",
      readModel,
    } as never);

    expect(response.docs[0]?.id).toBe("doc-policy");
  });

  test("returns an empty result set when nothing matches", async () => {
    const response = await searchAgentDocs({ query: "nonexistent", agent_id: "agent-claude-code" }, {
      vaultRoot: "/tmp/relayhq-vault",
      readModel: createReadModel(),
    } as never);

    expect(response.docs).toEqual([]);
  });

  test("rejects empty query input", async () => {
    await expect(searchAgentDocs({ query: "   " }, {
      vaultRoot: "/tmp/relayhq-vault",
      readModel: createReadModel(),
    } as never)).rejects.toMatchObject({ statusCode: 422 });
  });

  test("ignores invalid doc types and clamps limit", async () => {
    const response = await searchAgentDocs({
      query: "deploy",
      agent_id: "agent-claude-code",
      types: ["policy", "not-a-real-type"],
      limit: 999,
    }, {
      vaultRoot: "/tmp/relayhq-vault",
      readModel: createReadModel(),
    } as never);

    expect(response.docs.map((doc) => doc.id)).toEqual(["doc-policy"]);
    expect(response.docs).toHaveLength(1);
  });
});
