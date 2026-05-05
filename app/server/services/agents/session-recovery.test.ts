import { describe, expect, test } from "bun:test";

import { recoverStoppedSessionTasks } from "./session-recovery";

describe("recoverStoppedSessionTasks", () => {
  test("returns only the exact stopped task to todo without touching another task for the same agent", async () => {
    const patches: Array<{ taskId: string; actorId: string; patch: Record<string, unknown>; releaseLock?: boolean; recoverStaleLock?: boolean; recoverActiveLock?: boolean }> = [];

    const recovered = await recoverStoppedSessionTasks("/tmp/relayhq", {
      readModelReader: async () => ({
        tasks: [
          {
            id: "task-1",
            status: "in-progress",
            assignee: "agent-a",
            lockedBy: "agent-a",
          },
          {
            id: "task-2",
            status: "in-progress",
            assignee: "agent-a",
            lockedBy: "agent-a",
          },
          {
            id: "task-3",
            status: "todo",
            assignee: "agent-a",
            lockedBy: null,
          },
        ],
      } as never),
      sessionRegistryReader: async () => ([
        {
          agentId: "agent-a",
          taskId: "task-1",
          sessionId: "session-stopped",
          status: "stopped",
          updatedAt: "2099-01-01T00:10:00Z",
          projectId: "project-demo",
        },
        {
          agentId: "agent-a",
          taskId: "task-2",
          sessionId: "session-active",
          status: "active",
          updatedAt: "2099-01-01T00:10:00Z",
          projectId: "project-demo",
        },
      ]),
      patchTaskLifecycleRunner: async (request) => {
        patches.push({
          taskId: request.taskId,
          actorId: request.actorId,
          patch: request.patch as Record<string, unknown>,
          releaseLock: request.releaseLock,
          recoverStaleLock: request.recoverStaleLock as boolean | undefined,
          recoverActiveLock: request.recoverActiveLock as boolean | undefined,
        });
        return {} as never;
      },
    });

    expect(recovered).toBe(1);
    expect(patches).toHaveLength(1);
    expect(patches[0]?.taskId).toBe("task-1");
    expect(patches[0]?.actorId).toBe("agent-a");
    expect(patches[0]?.releaseLock).toBe(true);
    expect(patches[0]?.recoverStaleLock).toBe(true);
    expect(patches[0]?.recoverActiveLock).toBe(true);
    expect(patches[0]?.patch.status).toBe("todo");
    expect(patches[0]?.patch.dispatch_status).toBe("failed");
    expect(String(patches[0]?.patch.execution_notes ?? "")).toContain("session-stopped");
  });
});
