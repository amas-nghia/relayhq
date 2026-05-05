import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, test } from "bun:test"

import { cleanupStaleAgentTaskSessionRecords, clearAgentTaskSessionRecord, markAgentTaskSessionStopped, readAgentTaskSessionRecord, upsertAgentTaskSessionRecord } from "./session-registry"

describe("session registry", () => {
  test("stores and reads an active task session", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-session-registry-"))
    try {
      await upsertAgentTaskSessionRecord(root, {
        agentId: "agent-1",
        taskId: "task-1",
        sessionId: "session-1",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })

      expect(await readAgentTaskSessionRecord(root, "agent-1", "task-1")).toEqual({
        agentId: "agent-1",
        taskId: "task-1",
        sessionId: "session-1",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("replaces an existing session for the same agent and task", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-session-registry-replace-"))
    try {
      await upsertAgentTaskSessionRecord(root, {
        agentId: "agent-1",
        taskId: "task-1",
        sessionId: "session-1",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
      await upsertAgentTaskSessionRecord(root, {
        agentId: "agent-1",
        taskId: "task-1",
        sessionId: "session-2",
        status: "active",
        updatedAt: "2026-01-01T00:01:00.000Z",
      })

      expect(await readAgentTaskSessionRecord(root, "agent-1", "task-1")).toMatchObject({
        sessionId: "session-2",
        status: "active",
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("marks sessions stopped and clears records", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-session-registry-stop-"))
    try {
      await upsertAgentTaskSessionRecord(root, {
        agentId: "agent-1",
        taskId: "task-1",
        sessionId: "session-1",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })

      await markAgentTaskSessionStopped(root, "agent-1", "task-1", "session-1", new Date("2026-01-01T00:02:00.000Z"))
      expect(await readAgentTaskSessionRecord(root, "agent-1", "task-1")).toMatchObject({
        sessionId: "session-1",
        status: "stopped",
      })

      await clearAgentTaskSessionRecord(root, "agent-1", "task-1", "session-1")
      expect(await readAgentTaskSessionRecord(root, "agent-1", "task-1")).toBeNull()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("marks active records stopped when no reusable runner exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-session-registry-cleanup-"))
    try {
      await upsertAgentTaskSessionRecord(root, {
        agentId: "agent-1",
        taskId: "task-1",
        sessionId: "session-missing",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })

      expect(await cleanupStaleAgentTaskSessionRecords(root, new Date("2026-01-01T00:03:00.000Z"))).toBe(1)
      expect(await readAgentTaskSessionRecord(root, "agent-1", "task-1")).toMatchObject({
        status: "stopped",
        sessionId: "session-missing",
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
