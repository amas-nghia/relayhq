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
    ],
    agents: [
      {
        id: "agent-claude-code",
        type: "agent",
        workspaceId: "ws-demo",
        name: "Claude Code",
        role: "implementation",
        roles: ["implementation"],
        provider: "claude",
        model: "sonnet",
        capabilities: [],
        taskTypesAccepted: [],
        approvalRequiredFor: [],
        cannotDo: [],
        accessibleBy: [],
        skillFile: "skills/claude-code.md",
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
  });
});
