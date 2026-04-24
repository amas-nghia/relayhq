import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "bun:test";

import { executeRelayHQInvocation, resolveRelayHQBaseUrl } from "./relayhq";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("relayhq CLI config resolution", () => {
  test("walks up directories to find .relayhq base url", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-cli-config-"));
    roots.push(root);
    const nested = join(root, "packages", "demo");
    await mkdir(nested, { recursive: true });
    await writeFile(join(root, ".relayhq"), "RELAYHQ_BASE_URL=http://127.0.0.1:4010\nRELAYHQ_VAULT_ROOT=/tmp/vault\n", "utf8");

    const previousCwd = process.cwd();
    process.chdir(nested);
    try {
      await expect(resolveRelayHQBaseUrl(["tasks"], {})).resolves.toBe("http://127.0.0.1:4010");
    } finally {
      process.chdir(previousCwd);
    }
  });

  test("init writes .relayhq from /api/settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-cli-init-"));
    roots.push(root);
    const previousCwd = process.cwd();
    const originalFetch = globalThis.fetch;
    process.chdir(root);
    globalThis.fetch = (async () => new Response(JSON.stringify({ vaultRoot: "/tmp/demo-vault", resolvedRoot: "/tmp/demo-vault" }), { status: 200 })) as typeof fetch;

    try {
      const client = {
        listTasks: async () => [],
        claimTask: async () => undefined,
        updateTaskStatus: async () => undefined,
        sendHeartbeat: async () => undefined,
        requestApproval: async () => undefined,
      };
      const result = await executeRelayHQInvocation(client, ["init"]);
      expect(result.command).toBe("init");
      await expect(readFile(join(root, ".relayhq"), "utf8")).resolves.toContain("RELAYHQ_VAULT_ROOT=/tmp/demo-vault");
    } finally {
      process.chdir(previousCwd);
      globalThis.fetch = originalFetch;
    }
  });
});
