import { appendFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { createError, defineEventHandler, readBody } from "h3";

import { readConfiguredVaultRoot, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export interface ShellProfileWriteResponse {
  readonly written: boolean;
  readonly path: string;
}

const UNIX_PROFILE_TARGETS = {
  zshrc: ".zshrc",
  bashrc: ".bashrc",
} as const;

type UnixShellTarget = keyof typeof UNIX_PROFILE_TARGETS;
type ShellTarget = UnixShellTarget | "powershell";

function isShellTarget(value: unknown): value is ShellTarget {
  return value === "zshrc" || value === "bashrc" || value === "powershell";
}

function powershellProfilePath(homeDir: string): string {
  // Standard PSModulePath location works on Windows, macOS, and Linux PowerShell installs.
  return join(homeDir, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1");
}

export async function writeShellProfile(
  target: ShellTarget,
  options: { cwd?: string; env?: NodeJS.ProcessEnv; homeDir?: string } = {},
): Promise<ShellProfileWriteResponse> {
  const env = options.env ?? process.env;
  const vaultRoot = readConfiguredVaultRoot(env) ?? resolveVaultWorkspaceRoot(options.cwd ?? process.cwd(), env);
  const home = options.homeDir ?? homedir();

  if (target === "powershell") {
    const profilePath = powershellProfilePath(home);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(home, "Documents", "PowerShell"), { recursive: true });

    const lines = [
      `$env:RELAYHQ_BASE_URL = "http://127.0.0.1:44210"`,
      `$env:RELAYHQ_VAULT_ROOT = "${vaultRoot}"`,
    ];

    let existing = "";
    try { existing = await readFile(profilePath, "utf-8"); } catch { /* new file */ }

    if (existing.includes("RELAYHQ_BASE_URL")) {
      return { written: false, path: profilePath };
    }

    const block = `\n# RelayHQ\n${lines.join("\n")}\n`;
    await appendFile(profilePath, block, "utf-8");
    return { written: true, path: profilePath };
  }

  const profilePath = join(home, UNIX_PROFILE_TARGETS[target]);

  const exportLines = [
    `export RELAYHQ_BASE_URL="http://127.0.0.1:44210"`,
    `export RELAYHQ_VAULT_ROOT="${vaultRoot}"`,
  ];

  let existingContent = "";
  try {
    existingContent = await readFile(profilePath, "utf-8");
  } catch {
    // file may not exist yet — appendFile will create it
  }

  if (existingContent.includes("RELAYHQ_BASE_URL")) {
    return { written: false, path: profilePath };
  }

  const block = `\n# RelayHQ\n${exportLines.join("\n")}\n`;
  await appendFile(profilePath, block, "utf-8");

  return { written: true, path: profilePath };
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!isShellTarget(body?.target)) {
    throw createError({ statusCode: 400, statusMessage: "target must be 'zshrc', 'bashrc', or 'powershell'." });
  }

  return await writeShellProfile(body.target);
});
