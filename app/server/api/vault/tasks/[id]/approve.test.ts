import { describe, expect, test } from "bun:test";

import { approveVaultTask } from "./approve";

describe("POST /api/vault/tasks/[id]/approve", () => {
  test("approves a waiting task through the lifecycle service", async () => {
    const result = await approveVaultTask(
      "task-001",
      { actorId: "@alice" },
      {
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
        approveTaskLifecycle: async () => ({ frontmatter: { status: "in-progress", approval_outcome: "approved" } } as never),
      },
    );

    expect(result.frontmatter).toMatchObject({ status: "in-progress", approval_outcome: "approved" });
  });

  test("rejects invalid payloads", async () => {
    await expect(approveVaultTask("task-001", { actorId: "" })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "actorId is required.",
    });
  });

  test("propagates illegal transition errors", async () => {
    await expect(approveVaultTask(
      "task-001",
      { actorId: "@alice" },
      {
        approveTaskLifecycle: async () => {
          throw { statusCode: 409, statusMessage: "Task task-001 is todo, not waiting-approval." };
        },
      },
    )).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "Task task-001 is todo, not waiting-approval.",
    });
  });
});
