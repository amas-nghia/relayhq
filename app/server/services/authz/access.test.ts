import { describe, expect, test } from "bun:test";

import type { AgentFrontmatter, ProviderOverlayFrontmatter, WorkspaceFrontmatter } from "../../../shared/vault/schema";
import {
  AccessDeniedError,
  canReadAgent,
  canReadProject,
  canReadProviderOverlay,
  canReadWorkspace,
  canWriteAgent,
  canWriteProject,
  canWriteProviderOverlay,
  canWriteWorkspace,
  guardAccess,
  type AccessPrincipal,
  type ProjectFrontmatter,
} from "./access";
import { createProviderOverlayWritePlan, ProviderOverlayRuleError } from "../providers/overlay";

const owner: AccessPrincipal = { userId: "@alice" };
const member: AccessPrincipal = { userId: "@bob" };
const stranger: AccessPrincipal = { userId: "@mallory" };

const workspace: WorkspaceFrontmatter = {
  id: "ws-acme",
  type: "workspace",
  name: "Acme Corp",
  owner_ids: ["@alice"],
  member_ids: ["@alice", "@bob"],
  created_at: "2026-04-14T10:00:00Z",
  updated_at: "2026-04-14T10:00:00Z",
};

const project: ProjectFrontmatter = {
  id: "project-auth",
  workspace_id: "ws-acme",
  owner_ids: ["@alice"],
  member_ids: ["@bob"],
};

const agent: AgentFrontmatter = {
  id: "agent-backend-dev",
  type: "agent",
  name: "Backend Developer",
  role: "implementation",
  provider: "claude",
  model: "claude-sonnet-4-6",
  capabilities: ["write-go-code"],
  task_types_accepted: ["feature-implementation"],
  approval_required_for: ["breaking-api-change"],
  cannot_do: ["frontend-code"],
  accessible_by: ["@alice", "@bob"],
  skill_file: "skills/relayhq-backend-dev.md",
  status: "available",
  workspace_id: "ws-acme",
  created_at: "2026-04-14T10:00:00Z",
  updated_at: "2026-04-14T10:00:00Z",
};

const overlay: ProviderOverlayFrontmatter = {
  type: "provider-overlay",
  user_id: "@alice",
  provider: "claude",
  model: "claude-sonnet-4-6",
  api_key_ref: "env:ANTHROPIC_API_KEY",
  routing: {
    default_agent: "agent-backend-dev",
    prefer_agents: ["agent-backend-dev"],
  },
  tool_policy: {
    allow_bash: true,
    allow_file_write: true,
    allow_network: false,
  },
  preferences: {
    language: "en",
    response_style: "concise",
    auto_heartbeat: true,
    heartbeat_interval_seconds: 300,
  },
  updated_at: "2026-04-14T10:00:00Z",
};

describe("workspace access control", () => {
  test("allows owners to read and write workspaces", () => {
    expect(canReadWorkspace(owner, workspace).allowed).toBe(true);
    expect(canWriteWorkspace(owner, workspace).allowed).toBe(true);
  });

  test("denies workspace writes for non-owners", () => {
    expect(canReadWorkspace(member, workspace).allowed).toBe(true);
    expect(canWriteWorkspace(member, workspace).allowed).toBe(false);
  });
});

describe("project access control", () => {
  test("allows workspace members to read and only owners to write", () => {
    expect(canReadProject(member, workspace, project).allowed).toBe(true);
    expect(canWriteProject(member, workspace, project).allowed).toBe(false);

    expect(canWriteProject(owner, workspace, project).allowed).toBe(true);
  });

  test("rejects projects outside the workspace before mutation", () => {
    const foreignProject: ProjectFrontmatter = {
      ...project,
      workspace_id: "ws-other",
    };

    const decision = canReadProject(owner, workspace, foreignProject);
    expect(decision.allowed).toBe(false);

    let mutated = false;
    expect(() =>
      guardAccess(decision, () => {
        mutated = true;
      }),
    ).toThrow(AccessDeniedError);
    expect(mutated).toBe(false);
  });

  test("denies strangers from project reads", () => {
    expect(canReadProject(stranger, workspace, project).allowed).toBe(false);
  });
});

describe("agent access control", () => {
  test("allows workspace members on accessible agents", () => {
    expect(canReadAgent(member, workspace, agent).allowed).toBe(true);
    expect(canWriteAgent(owner, workspace, agent).allowed).toBe(true);
  });

  test("denies agent reads for unauthorized users", () => {
    expect(canReadAgent(stranger, workspace, agent).allowed).toBe(false);
    expect(canWriteAgent(member, workspace, agent).allowed).toBe(false);
  });
});

describe("provider overlay privacy rules", () => {
  test("keeps overlays private to the owning user", () => {
    expect(canReadProviderOverlay(owner, overlay).allowed).toBe(true);
    expect(canWriteProviderOverlay(owner, overlay).allowed).toBe(true);
    expect(canReadProviderOverlay(member, overlay).allowed).toBe(false);
  });

  test("rejects overlay writes into shared vault paths", () => {
    expect(() =>
      createProviderOverlayWritePlan("@alice", "vault/shared/projects/project-auth.md", overlay),
    ).toThrow(ProviderOverlayRuleError);
  });

  test("rejects overlays containing raw secrets", () => {
    expect(() =>
      createProviderOverlayWritePlan("@alice", "vault/users/alice/provider.md", {
        ...overlay,
        api_key: "sk-live-raw-secret",
      } as unknown as ProviderOverlayFrontmatter),
    ).toThrow(ProviderOverlayRuleError);
  });

  test("rejects overlays written for the wrong user", () => {
    expect(() =>
      createProviderOverlayWritePlan("@bob", "vault/users/bob/provider.md", overlay),
    ).toThrow(ProviderOverlayRuleError);
  });

  test("blocks unauthorized overlay writes before mutation", () => {
    const decision = canWriteProviderOverlay(stranger, overlay);
    let mutated = false;

    expect(() =>
      guardAccess(decision, () => {
        mutated = true;
      }),
    ).toThrow(AccessDeniedError);

    expect(mutated).toBe(false);
  });
});
