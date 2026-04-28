import { describe, expect, test } from "bun:test";

import { createTaskSessionObserver, resolveCommand, resolveLaunchCwd } from "./launch";

describe("resolveLaunchCwd", () => {
  test("resolves relative project codebase paths against the vault root", () => {
    expect(resolveLaunchCwd("/home/user/Documents/Obsidian Vault", {
      codebases: [{ name: "main", path: "../GitHub/RelayHQ-vault-first", primary: true }],
    } as never)).toBe("/home/user/Documents/GitHub/RelayHQ-vault-first");
  });

  test("preserves absolute project codebase paths", () => {
    expect(resolveLaunchCwd("/vault", {
      codebases: [{ name: "main", path: "/workspace/repo", primary: true }],
    } as never)).toBe("/workspace/repo");
  });

  test("builds OpenCode command with JSON mode, permissions bypass, and cwd dir", () => {
    expect(resolveCommand({ provider: "openai", runtimeKind: "opencode" } as never, "hello", "/workspace/repo")).toEqual({
      command: "opencode",
      args: ["run", "hello", "--format", "json", "--dangerously-skip-permissions", "--dir", "/workspace/repo"],
      runtimeKind: "opencode",
    });
  });

  test("session observer writes lifecycle notes and heartbeats", async () => {
    const patches: Array<{ actorId: string; patch: Record<string, unknown> }> = []
    const events: Array<{ type: string; text?: string }> = []
    let heartbeats = 0

    const observer = createTaskSessionObserver({
      sessionId: "session-1",
      taskId: "task-1",
      agentId: "agent-1",
      runtimeKind: "opencode",
      vaultRoot: "/vault",
      heartbeatIntervalMs: 5,
    }, {
      patchTaskLifecycle: async ({ actorId, patch }) => {
        patches.push({ actorId, patch: patch as Record<string, unknown> })
        return {} as never
      },
      appendAgentSessionEvent: async (_vaultRoot, event) => {
        events.push({ type: event.type, text: event.text })
      },
      heartbeatTaskLifecycle: async () => {
        heartbeats += 1
        return {} as never
      },
    })

    await observer.onLaunchStarted()
    observer.onStdout("hello")
    observer.onStderr("oops")
    await new Promise((resolve) => setTimeout(resolve, 16))
    observer.onClose(0)
    observer.dispose()

    expect(patches.some((entry) => entry.patch.execution_notes === "Background opencode session is running and waiting for agent output.")).toBe(true)
    expect(patches.some((entry) => entry.patch.execution_notes === "opencode session emitted terminal output.")).toBe(true)
    expect(patches.some((entry) => entry.patch.execution_notes === "opencode session emitted terminal error output.")).toBe(true)
    expect(patches.some((entry) => entry.patch.execution_notes === "opencode session exited cleanly.")).toBe(true)
    expect(events.filter((entry) => entry.type === "reasoning.summary").length).toBeGreaterThanOrEqual(4)
    expect(heartbeats).toBeGreaterThan(0)
  });

  test("session observer sends failed tasks back to todo and releases the lock", async () => {
    const patches: Array<{ actorId: string; patch: Record<string, unknown>; releaseLock?: boolean }> = []

    const observer = createTaskSessionObserver({
      sessionId: "session-2",
      taskId: "task-2",
      agentId: "agent-2",
      runtimeKind: "opencode",
      vaultRoot: "/vault",
      currentColumn: "todo",
      hasCronSchedule: false,
    }, {
      patchTaskLifecycle: async ({ actorId, patch, releaseLock }) => {
        patches.push({ actorId, patch: patch as Record<string, unknown>, releaseLock })
        return {} as never
      },
      appendAgentSessionEvent: async () => undefined,
      heartbeatTaskLifecycle: async () => ({} as never),
    })

    observer.onClose(1)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(patches.some((entry) => entry.releaseLock === true && entry.patch.status === "failed" && entry.patch.column === "todo")).toBe(true)
  })

  test("session observer sends failed scheduled tasks back to scheduled", async () => {
    const patches: Array<{ patch: Record<string, unknown> }> = []

    const observer = createTaskSessionObserver({
      sessionId: "session-3",
      taskId: "task-3",
      agentId: "agent-3",
      runtimeKind: "opencode",
      vaultRoot: "/vault",
      currentColumn: "todo",
      hasCronSchedule: true,
    }, {
      patchTaskLifecycle: async ({ patch }) => {
        patches.push({ patch: patch as Record<string, unknown> })
        return {} as never
      },
      appendAgentSessionEvent: async () => undefined,
      heartbeatTaskLifecycle: async () => ({} as never),
    })

    observer.onError(new Error("boom"))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(patches.some((entry) => entry.patch.status === "failed" && entry.patch.column === "scheduled")).toBe(true)
  })
});
