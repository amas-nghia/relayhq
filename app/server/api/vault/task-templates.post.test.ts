import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { deleteTaskTemplate, listTaskTemplates, readTaskTemplate } from "../../services/vault/task-templates";
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

  test("lists and deletes saved task templates", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-task-template-"))

    try {
      await createTaskTemplate({
        name: "Bug Triage",
        title: "Triage a reported bug",
        objective: "Reproduce the report and classify the likely root cause.",
        acceptanceCriteria: "Bug is reproduced\nPriority is assigned",
        contextFiles: "docs/runbook.md",
        constraints: "Do not patch production code",
      }, { vaultRoot: root })

      await expect(listTaskTemplates({ vaultRoot: root })).resolves.toEqual([
        expect.objectContaining({
          id: "bug-triage",
          name: "Bug Triage",
          title: "Triage a reported bug",
          acceptanceCriteria: ["Bug is reproduced", "Priority is assigned"],
        }),
      ])

      await expect(readTaskTemplate("bug-triage", { vaultRoot: root })).resolves.toEqual(expect.objectContaining({
        objective: "Reproduce the report and classify the likely root cause.",
        contextFiles: ["docs/runbook.md"],
      }))

      await expect(deleteTaskTemplate("bug-triage", { vaultRoot: root })).resolves.toEqual(expect.objectContaining({
        success: true,
        data: expect.objectContaining({ id: "bug-triage" }),
      }))
      await expect(readFile(join(root, "vault", "shared", "templates", "bug-triage.md"), "utf8")).rejects.toBeDefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
