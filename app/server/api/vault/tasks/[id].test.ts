import { describe, expect, test } from "bun:test";

import { patchVaultTask } from "./[id]";

describe("PATCH /api/vault/tasks/[id]", () => {
  test("starts autorun when requested", async () => {
    const result = await patchVaultTask(
      "task-001",
      { actorId: "human-user", patch: {}, autoRun: true },
      {
        patchTaskLifecycle: async () => ({ previous: {} as never, frontmatter: {} as never, body: "" }),
        startTaskAutorun: async () => ({ runnerId: "runner-1", command: "claude:chat" }),
      },
    );

    expect(result).toEqual({
      previous: {},
      frontmatter: {},
      body: "",
      autoRun: { started: true, runnerId: "runner-1", command: "claude:chat" },
    });
  });
});
