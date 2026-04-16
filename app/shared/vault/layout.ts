export type VaultOwnership = "shared" | "private" | "system";

export type VaultCollection =
  | "workspaces"
  | "projects"
  | "boards"
  | "columns"
  | "tasks"
  | "approvals"
  | "agents"
  | "audit"
  | "threads"
  | "provider-overlay"
  | "prefs"
  | "scratch"
  | "schemas"
  | "templates";

export interface VaultLayoutEntry {
  readonly ownership: VaultOwnership;
  readonly collection: VaultCollection;
  readonly path: string;
  readonly frontmatterType: string;
  readonly description: string;
}

export interface VaultLayout {
  readonly shared: ReadonlyArray<VaultLayoutEntry>;
  readonly "private": ReadonlyArray<VaultLayoutEntry>;
  readonly system: ReadonlyArray<VaultLayoutEntry>;
}

export const sourceOfTruthRules = {
  shared: "Committed coordination state that the team treats as canonical.",
  private: "Per-user overlays and local preferences that must stay out of shared commits.",
  system: "Versioned schemas and templates that define the vault contract.",
} as const;

export const canonicalVaultLayout = {
  shared: [
    {
      ownership: "shared",
      collection: "workspaces",
      path: "vault/shared/workspaces/{workspace_id}.md",
      frontmatterType: "workspace",
      description: "Workspace coordination records.",
    },
    {
      ownership: "shared",
      collection: "projects",
      path: "vault/shared/projects/{project_id}.md",
      frontmatterType: "project",
      description: "Project coordination records.",
    },
    {
      ownership: "shared",
      collection: "boards",
      path: "vault/shared/boards/{board_id}.md",
      frontmatterType: "board",
      description: "Board metadata and placement.",
    },
    {
      ownership: "shared",
      collection: "columns",
      path: "vault/shared/columns/{column_id}.md",
      frontmatterType: "column",
      description: "Board column definitions.",
    },
    {
      ownership: "shared",
      collection: "tasks",
      path: "vault/shared/tasks/{task_id}.md",
      frontmatterType: "task",
      description: "Primary coordination tasks and their execution metadata.",
    },
    {
      ownership: "shared",
      collection: "approvals",
      path: "vault/shared/approvals/{approval_id}.md",
      frontmatterType: "approval",
      description: "Approval records and decisions that accompany risky work.",
    },
    {
      ownership: "shared",
      collection: "agents",
      path: "vault/shared/agents/{agent_id}.md",
      frontmatterType: "agent",
      description: "Agent capability and routing records.",
    },
    {
      ownership: "shared",
      collection: "audit",
      path: "vault/shared/audit/{audit_note_id}.md",
      frontmatterType: "audit-note",
      description: "Audit notes and traceability entries.",
    },
    {
      ownership: "shared",
      collection: "threads",
      path: "vault/shared/threads/{thread_id}.md",
      frontmatterType: "thread",
      description: "Discussion threads linked to work items.",
    },
  ],
  private: [
    {
      ownership: "private",
      collection: "provider-overlay",
      path: "vault/users/{user_id}/provider.md",
      frontmatterType: "provider-overlay",
      description: "Per-user provider routing and tool policy overlay.",
    },
    {
      ownership: "private",
      collection: "prefs",
      path: "vault/users/{user_id}/prefs.md",
      frontmatterType: "prefs",
      description: "Per-user local preferences.",
    },
    {
      ownership: "private",
      collection: "scratch",
      path: "vault/users/{user_id}/scratch/",
      frontmatterType: "note",
      description: "Uncommitted scratch space for private notes.",
    },
  ],
  system: [
    {
      ownership: "system",
      collection: "schemas",
      path: "vault/system/schemas/",
      frontmatterType: "schema",
      description: "Versioned schema assets and contracts.",
    },
    {
      ownership: "system",
      collection: "templates",
      path: "vault/system/templates/",
      frontmatterType: "template",
      description: "Canonical file templates for new vault objects.",
    },
  ],
} as const satisfies VaultLayout;

export function canonicalVaultPaths(): ReadonlyArray<string> {
  return [
    ...canonicalVaultLayout.shared.map((entry) => entry.path),
    ...canonicalVaultLayout.private.map((entry) => entry.path),
    ...canonicalVaultLayout.system.map((entry) => entry.path),
  ];
}

export function getVaultOwnership(path: string): VaultOwnership | null {
  if (path.startsWith("vault/shared/")) {
    return "shared";
  }

  if (path.startsWith("vault/users/")) {
    return "private";
  }

  if (path.startsWith("vault/system/")) {
    return "system";
  }

  return null;
}

export function isSharedVaultPath(path: string): boolean {
  return getVaultOwnership(path) === "shared";
}

export function isPrivateVaultPath(path: string): boolean {
  return getVaultOwnership(path) === "private";
}

export function isSystemVaultPath(path: string): boolean {
  return getVaultOwnership(path) === "system";
}
