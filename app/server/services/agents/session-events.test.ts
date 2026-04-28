import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { appendAgentSessionEvent, readAgentSessionEvents } from "./session-events";

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
})
