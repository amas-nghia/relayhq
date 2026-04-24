import { appendFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { createError, defineEventHandler, readBody } from "h3";

import { readConfiguredVaultRoot, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export interface ShellProfileWriteResponse {
  readonly written: boolean;
  readonly path: string;
}

const PROFILE_TARGETS = {
  zshrc: ".zshrc",
  bashrc: ".bashrc",
} as const;

type ShellTarget = keyof typeof PROFILE_TARGETS;

function isShellTarget(value: unknown): value is ShellTarget {
  return value === "zshrc" || value === "bashrc";
}

export async function writeShellProfile(
  target: ShellTarget,
  options: { cwd?: string; env?: NodeJS.ProcessEnv; homeDir?: string } = {},
): Promise<ShellProfileWriteResponse> {
  const env = options.env ?? process.env;
  const vaultRoot = readConfiguredVaultRoot(env) ?? resolveVaultWorkspaceRoot(options.cwd ?? process.cwd(), env);
  const profilePath = join(options.homeDir ?? homedir(), PROFILE_TARGETS[target]);

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
    throw createError({ statusCode: 400, statusMessage: "target must be 'zshrc' or 'bashrc'." });
  }

  return await writeShellProfile(body.target);
});
