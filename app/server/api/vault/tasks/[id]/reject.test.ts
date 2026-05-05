import { describe, expect, test } from "bun:test";

import { rejectVaultTask } from "./reject";

describe("POST /api/vault/tasks/[id]/reject", () => {
  test("rejects a waiting task through the lifecycle service", async () => {
    const result = await rejectVaultTask(
      "task-001",
      { actorId: "@alice", reason: "Missing release notes" },
      {
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
        rejectTaskLifecycle: async () => ({ frontmatter: { status: "blocked", approval_outcome: "rejected" } } as never),
      },
    );

    expect(result.frontmatter).toMatchObject({ status: "blocked", approval_outcome: "rejected" });
  });

  test("rejects invalid payloads", async () => {
    await expect(rejectVaultTask("task-001", { actorId: "@alice", reason: "" })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "actorId and reason are required.",
    });
  });

  test("propagates missing task errors", async () => {
    await expect(rejectVaultTask(
      "task-404",
      { actorId: "@alice", reason: "Missing release notes" },
      {
        rejectTaskLifecycle: async () => {
          throw { statusCode: 404, statusMessage: "Task task-404 was not found." };
        },
      },
    )).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "Task task-404 was not found.",
    });
  });
});
