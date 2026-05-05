import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { appendAgentSessionEvent, listRecordedAgentSessions, readAgentSessionEvents, readAgentSessionUsage, readRecordedAgentSession } from "./session-events";

describe("session event persistence", () => {
  test("serializes concurrent appends without corrupting JSONL", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-session-events-"))
    try {
      await Promise.all(Array.from({ length: 20 }, (_, index) => appendAgentSessionEvent(root, {
        sessionId: "session-1",
        agentId: "agent-1",
        taskId: "task-1",
        type: "terminal.stdout",
        timestamp: new Date(1_700_000_000_000 + index).toISOString(),
        text: `line ${index}`,
      })))

      const events = await readAgentSessionEvents(root, "session-1")
      expect(events).toHaveLength(20)
      expect(events.every((event) => event.type === "terminal.stdout")).toBe(true)

      const file = await readFile(join(root, "vault/shared/threads/agent-session-session-1.jsonl"), "utf8")
      expect(file.split(/\r?\n/).filter(Boolean)).toHaveLength(20)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("skips malformed lines instead of dropping the whole transcript", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-session-events-read-"))
    try {
      const filePath = join(root, "vault/shared/threads/agent-session-session-2.jsonl")
      await mkdir(join(root, "vault/shared/threads"), { recursive: true })
      await writeFile(filePath, '{"sessionId":"session-2","agentId":"agent-1","taskId":"task-1","type":"session.started","timestamp":"2026-01-01T00:00:00.000Z"}\nnot-json\n{"sessionId":"session-2","agentId":"agent-1","taskId":"task-1","type":"session.ended","timestamp":"2026-01-01T00:01:00.000Z"}\n', "utf8")

      const events = await readAgentSessionEvents(root, "session-2")
      expect(events.map((event) => event.type)).toEqual(["session.started", "session.ended"])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("summarizes estimated and runtime usage for a session", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-session-usage-"))
    try {
      await appendAgentSessionEvent(root, {
        sessionId: "session-3",
        agentId: "agent-1",
        taskId: "task-1",
        type: "session.usage",
        timestamp: "2026-01-01T00:00:00.000Z",
        usage: {
          promptTokens: 100,
          totalTokens: 100,
          model: "claude-sonnet-4-6",
          usageSource: "estimated",
          estimatedRemainingContextTokens: 199900,
          contextWindowTokens: 200000,
        },
      })
      await appendAgentSessionEvent(root, {
        sessionId: "session-3",
        agentId: "agent-1",
        taskId: "task-1",
        type: "reasoning.summary",
        timestamp: "2026-01-01T00:00:01.000Z",
        text: "Completed the requested change and wrote tests.",
      })

      const estimatedUsage = await readAgentSessionUsage(root, "session-3")
      expect(estimatedUsage.promptTokens).toBe(100)
      expect(estimatedUsage.totalTokens).toBeGreaterThan(100)
      expect(estimatedUsage.isEstimated).toBe(true)
      expect(estimatedUsage.estimatedRemainingContextTokens).toBe(199900)

      await appendAgentSessionEvent(root, {
        sessionId: "session-3",
        agentId: "agent-1",
        taskId: "task-1",
        type: "session.usage",
        timestamp: "2026-01-01T00:00:02.000Z",
        usage: {
          promptTokens: 120,
          completionTokens: 30,
          totalTokens: 150,
          costUsd: 0.0042,
          model: "claude-sonnet-4-6",
          usageSource: "runtime",
        },
      })

      const runtimeUsage = await readAgentSessionUsage(root, "session-3")
      expect(runtimeUsage.promptTokens).toBe(120)
      expect(runtimeUsage.completionTokens).toBe(30)
      expect(runtimeUsage.totalTokens).toBe(150)
      expect(runtimeUsage.costUsd).toBe(0.0042)
      expect(runtimeUsage.isEstimated).toBe(false)
      expect(runtimeUsage.usageSource).toBe("runtime")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("reconstructs recorded session summaries for warm resume", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-session-summary-"))
    try {
      await appendAgentSessionEvent(root, {
        sessionId: "session-4",
        agentId: "agent-coordinator",
        taskId: "task-coordinator",
        type: "session.started",
        timestamp: "2026-01-01T00:00:00.000Z",
        text: "Launch resume via claude-code: claude -p",
      })
      await appendAgentSessionEvent(root, {
        sessionId: "session-4",
        agentId: "agent-coordinator",
        taskId: "task-coordinator",
        type: "reasoning.summary",
        timestamp: "2026-01-01T00:00:01.000Z",
        text: "Reviewed worker progress and prepared next tasks.",
      })
      await appendAgentSessionEvent(root, {
        sessionId: "session-4",
        agentId: "agent-coordinator",
        taskId: "task-coordinator",
        type: "session.ended",
        timestamp: "2026-01-01T00:00:02.000Z",
      })

      const summary = await readRecordedAgentSession(root, "session-4")
      expect(summary).not.toBeNull()
      expect(summary?.launchMode).toBe("resume")
      expect(summary?.runtimeKind).toBe("claude-code")
      expect(summary?.status).toBe("completed")

      const sessions = await listRecordedAgentSessions(root, "agent-coordinator")
      expect(sessions).toHaveLength(1)
      expect(sessions[0]?.sessionId).toBe("session-4")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("marks stale recorded sessions without an end event as stopped", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-session-stale-"))
    try {
      await appendAgentSessionEvent(root, {
        sessionId: "session-5",
        agentId: "agent-worker",
        taskId: "task-worker",
        type: "session.started",
        timestamp: "2026-01-01T00:00:00.000Z",
        text: "Launch fresh via opencode: opencode run",
      })
      await appendAgentSessionEvent(root, {
        sessionId: "session-5",
        agentId: "agent-worker",
        taskId: "task-worker",
        type: "terminal.stdout",
        timestamp: "2026-01-01T00:00:05.000Z",
        text: "still working",
      })

      const summary = await readRecordedAgentSession(root, "session-5")
      expect(summary).not.toBeNull()
      expect(summary?.status).toBe("stopped")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
