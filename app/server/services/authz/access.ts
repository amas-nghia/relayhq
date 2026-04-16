import { getVaultOwnership } from "../../../shared/vault/layout";
import type {
  AgentFrontmatter,
  ProviderOverlayFrontmatter,
  WorkspaceFrontmatter,
} from "../../../shared/vault/schema";

export type AccessAction = "read" | "write";

export type AccessResourceKind = "workspace" | "project" | "agent" | "provider-overlay";

export interface AccessDecision {
  readonly allowed: boolean;
  readonly action: AccessAction;
  readonly resource: AccessResourceKind;
  readonly reason: string;
}

export interface AccessDeniedErrorOptions {
  readonly decision: AccessDecision;
}

export class AccessDeniedError extends Error {
  public readonly decision: AccessDecision;

  constructor({ decision }: AccessDeniedErrorOptions) {
    super(decision.reason);
    this.name = "AccessDeniedError";
    this.decision = decision;
  }
}

export interface AccessPrincipal {
  readonly userId: string;
}

export interface ProjectFrontmatter {
  readonly id: string;
  readonly workspace_id: string;
  readonly owner_ids: ReadonlyArray<string>;
  readonly member_ids: ReadonlyArray<string>;
}

function decision(
  action: AccessAction,
  resource: AccessResourceKind,
  allowed: boolean,
  reason: string,
): AccessDecision {
  return { action, resource, allowed, reason };
}

function hasUser(principal: AccessPrincipal, ids: ReadonlyArray<string>): boolean {
  return ids.includes(principal.userId);
}

function hasWorkspaceAccess(principal: AccessPrincipal, workspace: WorkspaceFrontmatter): boolean {
  return hasUser(principal, workspace.owner_ids) || hasUser(principal, workspace.member_ids);
}

function canWriteWorkspaceRecord(principal: AccessPrincipal, workspace: WorkspaceFrontmatter): boolean {
  return hasUser(principal, workspace.owner_ids);
}

function projectMatchesWorkspace(workspace: WorkspaceFrontmatter, project: ProjectFrontmatter): boolean {
  return project.workspace_id === workspace.id;
}

export function canReadWorkspace(principal: AccessPrincipal, workspace: WorkspaceFrontmatter): AccessDecision {
  if (!hasWorkspaceAccess(principal, workspace)) {
    return decision("read", "workspace", false, "workspace access denied");
  }

  return decision("read", "workspace", true, "workspace access granted");
}

export function canWriteWorkspace(principal: AccessPrincipal, workspace: WorkspaceFrontmatter): AccessDecision {
  if (!canWriteWorkspaceRecord(principal, workspace)) {
    return decision("write", "workspace", false, "workspace write denied");
  }

  return decision("write", "workspace", true, "workspace write granted");
}

export function canReadProject(
  principal: AccessPrincipal,
  workspace: WorkspaceFrontmatter,
  project: ProjectFrontmatter,
): AccessDecision {
  if (!projectMatchesWorkspace(workspace, project)) {
    return decision("read", "project", false, "project does not belong to workspace");
  }

  if (!hasWorkspaceAccess(principal, workspace)) {
    return decision("read", "project", false, "workspace access required to read project");
  }

  if (hasUser(principal, project.owner_ids) || hasUser(principal, project.member_ids)) {
    return decision("read", "project", true, "project access granted");
  }

  return decision("read", "project", false, "project access denied");
}

export function canWriteProject(
  principal: AccessPrincipal,
  workspace: WorkspaceFrontmatter,
  project: ProjectFrontmatter,
): AccessDecision {
  if (!projectMatchesWorkspace(workspace, project)) {
    return decision("write", "project", false, "project does not belong to workspace");
  }

  if (!hasWorkspaceAccess(principal, workspace)) {
    return decision("write", "project", false, "workspace access required to write project");
  }

  if (hasUser(principal, project.owner_ids)) {
    return decision("write", "project", true, "project write granted");
  }

  return decision("write", "project", false, "project write denied");
}

export function canReadAgent(principal: AccessPrincipal, workspace: WorkspaceFrontmatter, agent: AgentFrontmatter): AccessDecision {
  if (agent.workspace_id !== workspace.id) {
    return decision("read", "agent", false, "agent does not belong to workspace");
  }

  if (!hasWorkspaceAccess(principal, workspace)) {
    return decision("read", "agent", false, "workspace access required to read agent");
  }

  if (hasUser(principal, agent.accessible_by)) {
    return decision("read", "agent", true, "agent access granted");
  }

  return decision("read", "agent", false, "agent access denied");
}

export function canWriteAgent(principal: AccessPrincipal, workspace: WorkspaceFrontmatter, agent: AgentFrontmatter): AccessDecision {
  if (agent.workspace_id !== workspace.id) {
    return decision("write", "agent", false, "agent does not belong to workspace");
  }

  if (!canWriteWorkspaceRecord(principal, workspace)) {
    return decision("write", "agent", false, "workspace owner required to write agent records");
  }

  return decision("write", "agent", true, "agent write granted");
}

export function canReadProviderOverlay(principal: AccessPrincipal, overlay: ProviderOverlayFrontmatter): AccessDecision {
  if (principal.userId !== overlay.user_id) {
    return decision("read", "provider-overlay", false, "provider overlay is private to its owner");
  }

  return decision("read", "provider-overlay", true, "provider overlay access granted");
}

export function canWriteProviderOverlay(principal: AccessPrincipal, overlay: ProviderOverlayFrontmatter): AccessDecision {
  if (principal.userId !== overlay.user_id) {
    return decision("write", "provider-overlay", false, "provider overlay is private to its owner");
  }

  return decision("write", "provider-overlay", true, "provider overlay write granted");
}

export function isPrivateProviderOverlayPath(path: string): boolean {
  return getVaultOwnership(path) === "private" && /^vault\/users\/[^/]+\/provider\.md$/.test(path);
}

export function authorizeAccess(decision: AccessDecision): void {
  if (!decision.allowed) {
    throw new AccessDeniedError({ decision });
  }
}

export function guardAccess<T>(decision: AccessDecision, run: () => T): T {
  authorizeAccess(decision);
  return run();
}
