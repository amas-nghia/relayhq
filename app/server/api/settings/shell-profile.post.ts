import { appendFile, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { createError, defineEventHandler, readBody } from "h3";

import { readConfiguredVaultRoot, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export interface ShellProfileWriteResponse {
  readonly written: boolean;
  readonly path: string;
}

export interface ShellProfileWriteRequest {
  readonly target?: unknown;
  readonly envVars?: unknown;
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

function parseEnvVars(value: unknown): Record<string, string> {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: "envVars must be an object." });
  }

  const envVars: Record<string, string> = {};
  for (const [key, envValue] of Object.entries(value)) {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      throw createError({ statusCode: 400, statusMessage: `Invalid env var name: ${key}` });
    }
    if (typeof envValue !== "string" || envValue.trim().length === 0) {
      throw createError({ statusCode: 400, statusMessage: `Invalid env var value for ${key}` });
    }
    envVars[key] = envValue;
  }
  return envVars;
}

function unixExportLine(name: string, value: string): string {
  return `export ${name}=${JSON.stringify(value)}`;
}

function powershellExportLine(name: string, value: string): string {
  return `$env:${name} = '${value.replace(/'/g, "''")}'`;
}

function hasUnixExport(content: string, name: string): boolean {
  return new RegExp(`(^|\\n)export ${name}=`).test(content);
}

function hasPowerShellExport(content: string, name: string): boolean {
  return new RegExp(`(^|\\n)\\$env:${name}\\s*=`).test(content);
}

function powershellProfilePath(homeDir: string): string {
  // Standard PSModulePath location works on Windows, macOS, and Linux PowerShell installs.
  return join(homeDir, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1");
}

async function persistEnvVarsToAppDotEnv(vars: Record<string, string>, appDir: string): Promise<void> {
  if (Object.keys(vars).length === 0) return;
  const envFilePath = join(appDir, ".env");
  let existing = "";
  try { existing = await readFile(envFilePath, "utf-8"); } catch { /* file may not exist */ }

  const lines = existing.split("\n");
  for (const [name, value] of Object.entries(vars)) {
    const escaped = JSON.stringify(value);
    const lineIndex = lines.findIndex((l) => l.startsWith(`${name}=`) || l.startsWith(`${name} =`));
    if (lineIndex >= 0) {
      lines[lineIndex] = `${name}=${escaped}`;
    } else {
      lines.push(`${name}=${escaped}`);
    }
  }
  await writeFile(envFilePath, lines.join("\n"), "utf-8");
}

export async function writeShellProfile(
  target: ShellTarget,
  options: { cwd?: string; env?: NodeJS.ProcessEnv; envVars?: Record<string, string>; homeDir?: string } = {},
): Promise<ShellProfileWriteResponse> {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const vaultRoot = readConfiguredVaultRoot(env) ?? resolveVaultWorkspaceRoot(cwd, env);
  const home = options.homeDir ?? homedir();

  // Inject env vars into the live server process immediately so subprocesses
  // spawned after this call inherit them without requiring a server restart.
  const injectEnvVars = (vars: Record<string, string>) => {
    for (const [name, value] of Object.entries(vars)) {
      process.env[name] = value;
    }
  };

  // Also persist to the app's .env file so keys survive PM2 restarts.
  // process.cwd() is the app/ directory when running under PM2.
  await persistEnvVarsToAppDotEnv(options.envVars ?? {}, cwd).catch(() => { /* non-fatal */ });

  if (target === "powershell") {
    const profilePath = powershellProfilePath(home);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(home, "Documents", "PowerShell"), { recursive: true });

    const lines = [
      `$env:RELAYHQ_BASE_URL = "http://127.0.0.1:44210"`,
      `$env:RELAYHQ_VAULT_ROOT = "${vaultRoot}"`,
      ...Object.entries(options.envVars ?? {}).map(([name, value]) => powershellExportLine(name, value)),
    ];

    let existing = "";
    try { existing = await readFile(profilePath, "utf-8"); } catch { /* new file */ }

    const missingLines = lines.filter((line) => {
      const match = line.match(/^\$env:([A-Z_][A-Z0-9_]*)\s*=/);
      return !match || !hasPowerShellExport(existing, match[1]);
    });

    injectEnvVars(options.envVars ?? {});

    if (missingLines.length === 0) {
      return { written: false, path: profilePath };
    }

    const block = `\n# RelayHQ\n${missingLines.join("\n")}\n`;
    await appendFile(profilePath, block, "utf-8");
    return { written: true, path: profilePath };
  }

  const profilePath = join(home, UNIX_PROFILE_TARGETS[target]);

  const exportLines = [
    `export RELAYHQ_BASE_URL="http://127.0.0.1:44210"`,
    `export RELAYHQ_VAULT_ROOT="${vaultRoot}"`,
    ...Object.entries(options.envVars ?? {}).map(([name, value]) => unixExportLine(name, value)),
  ];

  let existingContent = "";
  try {
    existingContent = await readFile(profilePath, "utf-8");
  } catch {
    // file may not exist yet — appendFile will create it
  }

  const missingLines = exportLines.filter((line) => {
    const match = line.match(/^export ([A-Z_][A-Z0-9_]*)=/);
    return !match || !hasUnixExport(existingContent, match[1]);
  });

  injectEnvVars(options.envVars ?? {});

  if (missingLines.length === 0) {
    return { written: false, path: profilePath };
  }

  const block = `\n# RelayHQ\n${missingLines.join("\n")}\n`;
  await appendFile(profilePath, block, "utf-8");

  return { written: true, path: profilePath };
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ShellProfileWriteRequest>(event);

  if (!isShellTarget(body?.target)) {
    throw createError({ statusCode: 400, statusMessage: "target must be 'zshrc', 'bashrc', or 'powershell'." });
  }

  return await writeShellProfile(body.target, { envVars: parseEnvVars(body.envVars) });
});
