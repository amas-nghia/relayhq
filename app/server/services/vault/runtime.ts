import { stat } from "node:fs/promises";
import { basename, join } from "node:path";

export function resolveVaultWorkspaceRoot(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  if (env.RELAYHQ_VAULT_ROOT) {
    return env.RELAYHQ_VAULT_ROOT;
  }

  return basename(cwd) === "app" ? join(cwd, "..") : cwd;
}

export function resolveTaskFilePath(taskId: string, vaultRoot: string = resolveVaultWorkspaceRoot()): string {
  return join(vaultRoot, "vault", "shared", "tasks", `${taskId}.md`);
}

export function resolveSharedVaultPath(vaultRoot: string): string {
  return join(vaultRoot, "vault", "shared");
}

export function readConfiguredWorkspaceId(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.RELAYHQ_WORKSPACE_ID?.trim() || null;
}

export function readConfiguredVaultRoot(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.RELAYHQ_VAULT_ROOT?.trim() || null;
}

export function readExposedVaultRoot(): string | null {
  return process.env.RELAYHQ_VAULT_ROOT?.trim() || null;
}

export function normalizeConfiguredWorkspaceId(
  rawId: string | null,
  workspaces: ReadonlyArray<{ readonly id: string }>,
): string | null {
  if (rawId === null) return null;
  return workspaces.some((ws) => ws.id === rawId) ? rawId : null;
}

export async function validateVaultWorkspaceRoot(root: string): Promise<{ valid: boolean; path: string; reason: string | null }> {
  try {
    await stat(join(root, "vault", "shared"));
    return { valid: true, path: root, reason: null };
  } catch {
    return { valid: false, path: root, reason: `Expected an accessible vault/shared directory at ${join(root, "vault", "shared")}.` };
  }
}
