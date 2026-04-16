import { basename, join } from "node:path";

export function resolveVaultWorkspaceRoot(cwd: string = process.cwd()): string {
  if (process.env.RELAYHQ_VAULT_ROOT) {
    return process.env.RELAYHQ_VAULT_ROOT;
  }

  return basename(cwd) === "app" ? join(cwd, "..") : cwd;
}

export function resolveTaskFilePath(taskId: string, vaultRoot: string = resolveVaultWorkspaceRoot()): string {
  return join(vaultRoot, "vault", "shared", "tasks", `${taskId}.md`);
}
