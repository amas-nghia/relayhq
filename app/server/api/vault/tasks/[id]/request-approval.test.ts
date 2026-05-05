import { describe, expect, test } from "bun:test";

import { requestVaultTaskApproval } from "./request-approval";

describe("POST /api/vault/tasks/[id]/request-approval", () => {
  test("passes actor and reason to the lifecycle service", async () => {
    const result = await requestVaultTaskApproval(
      "task-001",
      { actorId: "agent-backend-dev", reason: "Need human sign-off" },
      {
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
        requestTaskApprovalLifecycle: async () => ({ frontmatter: { status: "waiting-approval" } } as never),
      },
    );

    expect(result.frontmatter).toMatchObject({ status: "waiting-approval" });
  });

  test("rejects invalid payloads", async () => {
    await expect(requestVaultTaskApproval("task-001", { actorId: "agent-backend-dev", reason: "" })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "actorId and reason are required.",
    });
  });

  test("propagates actor policy failures", async () => {
    await expect(requestVaultTaskApproval(
      "task-001",
      { actorId: "@alice", reason: "Need human sign-off" },
      {
        requestTaskApprovalLifecycle: async () => {
          throw { statusCode: 403, statusMessage: "Only agent actors may use the human approval path." };
        },
      },
    )).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: "Only agent actors may use the human approval path.",
    });
  });

  test("propagates missing task errors", async () => {
    await expect(requestVaultTaskApproval(
      "task-404",
      { actorId: "agent-backend-dev", reason: "Need human sign-off" },
      {
        requestTaskApprovalLifecycle: async () => {
          throw { statusCode: 404, statusMessage: "Task task-404 was not found." };
        },
      },
    )).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "Task task-404 was not found.",
    });
  });
});
