import { describe, expect, test } from "bun:test";

import { claimVaultTask } from "./claim";

describe("POST /api/vault/tasks/[id]/claim", () => {
  test("returns lifecycle result with relevant docs", async () => {
    const result = await claimVaultTask(
      "task-001",
      { actorId: "agent-backend-dev", assignee: "agent-backend-dev" },
      {
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
        readSharedVaultCollections: async () => ({}) as never,
        buildVaultReadModel: () => ({
          tasks: [{ id: "task-001", title: "Ship task lifecycle APIs" }],
        }) as never,
        claimTaskLifecycle: async () => ({ frontmatter: { status: "in-progress" } } as never),
        getRelevantDocsForTask: () => [{ id: "doc-1", title: "Runbook" }] as never,
      },
    );

    expect(result).toMatchObject({
      frontmatter: { status: "in-progress" },
      relevant_docs: [{ id: "doc-1", title: "Runbook" }],
    });
  });

  test("rejects missing actor ids", async () => {
    await expect(claimVaultTask("task-001", { actorId: "" })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "actorId is required.",
    });
  });

  test("rejects missing task ids", async () => {
    await expect(claimVaultTask("", { actorId: "agent-backend-dev" })).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: "Task id is required.",
    });
  });

  test("propagates lifecycle conflicts", async () => {
    await expect(claimVaultTask(
      "task-001",
      { actorId: "agent-backend-dev" },
      {
        resolveVaultWorkspaceRoot: () => "/tmp/relayhq-vault",
        readSharedVaultCollections: async () => ({}) as never,
        buildVaultReadModel: () => ({ tasks: [] }) as never,
        claimTaskLifecycle: async () => {
          throw { statusCode: 409, statusMessage: "Task task-001 is in-progress, not todo." };
        },
      },
    )).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: "Task task-001 is in-progress, not todo.",
    });
  });
});
