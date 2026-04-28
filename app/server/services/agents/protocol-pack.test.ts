import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { buildProtocolPack, setupProtocolPack } from "./protocol-pack";

describe("protocol pack helper", () => {
  test("builds runtime-specific protocol content", () => {
    const content = buildProtocolPack("claude-code", {
      baseUrl: "http://127.0.0.1:44210",
      vaultRoot: "/tmp/relayhq-vault",
      agentId: "claude-code",
      cwd: "/tmp/project",
    });

    expect(content).toContain("## RelayHQ - Agent Protocol");
    expect(content).toContain('relayhq_inbox(agentId="claude-code")');
    expect(content).toContain('relayhq_start(agentId="claude-code", taskId="task-xxx")');
  });

  test("installs the claude-code pack idempotently", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "relayhq-protocol-pack-"));
    try {
      const first = await setupProtocolPack("claude-code", {
        baseUrl: "http://127.0.0.1:44210",
        vaultRoot: "/tmp/relayhq-vault",
        agentId: "claude-code",
        cwd,
      });

      expect(first.appended).toBe(true);
      await expect(readFile(join(cwd, "CLAUDE.md"), "utf8")).resolves.toContain("## RelayHQ - Agent Protocol");

      const second = await setupProtocolPack("claude-code", {
        baseUrl: "http://127.0.0.1:44210",
        vaultRoot: "/tmp/relayhq-vault",
        agentId: "claude-code",
        cwd,
      });

      expect(second.appended).toBe(false);
      const content = await readFile(join(cwd, "CLAUDE.md"), "utf8");
      expect(content.match(/## RelayHQ - Agent Protocol/g)?.length).toBe(1);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("creates runtime-specific files", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "relayhq-protocol-pack-cursor-"));
    try {
      await mkdir(join(cwd, ".cursor"), { recursive: true });
      const result = await setupProtocolPack("cursor", {
        baseUrl: "http://127.0.0.1:44210",
        vaultRoot: "/tmp/relayhq-vault",
        agentId: "cursor",
        cwd,
      });

      expect(result.path).toContain(".cursor/rules/relayhq.mdc");
      expect(await readFile(join(cwd, ".cursor", "rules", "relayhq.mdc"), "utf8")).toContain("## RelayHQ - Agent Protocol");
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
