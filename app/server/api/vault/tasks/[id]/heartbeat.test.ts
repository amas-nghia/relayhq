import { describe, expect, mock, test } from "bun:test";

import { heartbeatVaultTask } from "./heartbeat";

describe("POST /api/vault/tasks/[id]/heartbeat", () => {
  test("writes an audit note after a successful heartbeat", async () => {
    const writeAuditNote = mock(async () => undefined);

    const result = await heartbeatVaultTask(
      "task-001",
      { actorId: "agent-backend-dev" },
      {
        heartbeatTaskLifecycle: async () => ({ frontmatter: { status: "in-progress" } } as never),
        writeAuditNote,
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
      },
    );

    expect(result.frontmatter).toMatchObject({ status: "in-progress" });
    expect(writeAuditNote).toHaveBeenCalledWith({
      vaultRoot: "/tmp/relayhq-vault",
      taskId: "task-001",
      source: "agent-backend-dev",
      message: "heartbeat from agent-backend-dev",
    });
  });

  test("swallows audit write failures", async () => {
    await expect(heartbeatVaultTask(
      "task-001",
      { actorId: "agent-backend-dev" },
      {
        heartbeatTaskLifecycle: async () => ({ frontmatter: { status: "in-progress" } } as never),
        writeAuditNote: async () => {
          throw new Error("disk full");
        },
      },
    )).resolves.toMatchObject({ frontmatter: { status: "in-progress" } });
  });

  test("rejects invalid payloads", async () => {
    await expect(heartbeatVaultTask("task-001", { actorId: "" })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "actorId is required.",
    });
  });

  test("propagates missing task errors", async () => {
    await expect(heartbeatVaultTask(
      "task-404",
      { actorId: "agent-backend-dev" },
      {
        heartbeatTaskLifecycle: async () => {
          throw { statusCode: 404, statusMessage: "Task task-404 was not found." };
        },
      },
    )).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: "Task task-404 was not found.",
    });
  });
});
