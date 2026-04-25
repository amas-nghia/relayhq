import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { createTaskTemplate } from "./task-templates.post";

describe("POST /api/vault/task-templates", () => {
  test("writes a markdown template file into vault/shared/templates", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-task-template-"))

    try {
      const response = await createTaskTemplate({
        name: "Fix Bug",
        title: "Fix checkout bug",
        objective: "Resolve the checkout bug without regressing payment flows.",
        acceptanceCriteria: "Checkout succeeds\nError state covered",
        contextFiles: "web/src/pages/Checkout.tsx",
        constraints: "Do not change API contract",
      }, { vaultRoot: root })

      expect(response.success).toBe(true)
      await expect(readFile(join(root, "vault", "shared", "templates", "fix-bug.md"), "utf8")).resolves.toContain("## Acceptance Criteria")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
