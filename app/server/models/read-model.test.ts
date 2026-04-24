import { describe, expect, test } from "bun:test";

import type { VaultReadCollections } from "../services/vault/repository";
import { buildVaultReadModel } from "./read-model";

describe("buildVaultReadModel", () => {
  test("builds docs into the canonical read model", () => {
    const collections: VaultReadCollections = {
      workspaces: [],
      projects: [],
      boards: [],
      columns: [],
      tasks: [],
      issues: [],
      docs: [
        {
          sourcePath: "vault/shared/docs/feature-vault-docs.md",
          body: "# Vault docs support",
          frontmatter: {
            id: "feature-vault-docs",
            type: "doc",
            doc_type: "feature-spec",
            workspace_id: "ws-alpha",
            project_id: "project-alpha",
            title: "Vault docs support",
            status: "draft",
            created_at: "2026-04-23T10:00:00Z",
            updated_at: "2026-04-23T10:05:00Z",
            tags: ["vault", "docs"],
          },
        },
      ],
      approvals: [],
      auditNotes: [],
      agents: [],
    };

    const model = buildVaultReadModel(collections);

    expect(model.docs).toEqual([
      {
        id: "feature-vault-docs",
        type: "doc",
        docType: "feature-spec",
        workspaceId: "ws-alpha",
        projectId: "project-alpha",
        title: "Vault docs support",
        status: "draft",
        createdAt: "2026-04-23T10:00:00Z",
        updatedAt: "2026-04-23T10:05:00Z",
        tags: ["docs", "vault"],
        body: "# Vault docs support",
        sourcePath: "vault/shared/docs/feature-vault-docs.md",
      },
    ]);
  });
});
