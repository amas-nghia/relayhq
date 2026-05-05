import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

import { agentRunnerManager, isRunnerSessionReusable } from "../runners/manager"

export interface AgentTaskSessionRecord {
  readonly agentId: string
  readonly taskId: string
  readonly sessionId: string
  readonly status: "active" | "stopped"
  readonly updatedAt: string
  readonly projectId?: string | null
}

interface SessionRegistryDocument {
  sessions: AgentTaskSessionRecord[]
}

const sessionRegistryWrites = new Map<string, Promise<void>>()

function resolveSessionRegistryPath(vaultRoot: string): string {
  return join(vaultRoot, "vault", "shared", "threads", "agent-task-sessions.json")
}

async function readSessionRegistry(vaultRoot: string): Promise<SessionRegistryDocument> {
  const filePath = resolveSessionRegistryPath(vaultRoot)
  try {
    const content = await readFile(filePath, "utf8")
    const parsed = JSON.parse(content) as SessionRegistryDocument
    return { sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] }
  } catch {
    return { sessions: [] }
  }
}

async function writeSessionRegistry(vaultRoot: string, document: SessionRegistryDocument): Promise<void> {
  const filePath = resolveSessionRegistryPath(vaultRoot)
  const tempFilePath = `${filePath}.${randomUUID()}.tmp`

  await mkdir(dirname(filePath), { recursive: true })
  try {
    await writeFile(tempFilePath, `${JSON.stringify(document, null, 2)}\n`, "utf8")
    await rename(tempFilePath, filePath)
  } finally {
    await rm(tempFilePath, { force: true }).catch(() => undefined)
  }
}

async function mutateSessionRegistry<T>(vaultRoot: string, mutator: (document: SessionRegistryDocument) => Promise<T> | T): Promise<T> {
  const filePath = resolveSessionRegistryPath(vaultRoot)
  const previousWrite = sessionRegistryWrites.get(filePath) ?? Promise.resolve()

  let result!: T
  const nextWrite = previousWrite
    .catch(() => undefined)
    .then(async () => {
      const current = await readSessionRegistry(vaultRoot)
      result = await mutator(current)
      await writeSessionRegistry(vaultRoot, current)
    })

  sessionRegistryWrites.set(filePath, nextWrite)
  await nextWrite
  return result
}

export async function readAgentTaskSessionRecord(vaultRoot: string, agentId: string, taskId: string): Promise<AgentTaskSessionRecord | null> {
  const document = await readSessionRegistry(vaultRoot)
  return document.sessions.find((entry) => entry.agentId === agentId && entry.taskId === taskId) ?? null
}

export async function listAgentTaskSessionRecords(vaultRoot: string): Promise<ReadonlyArray<AgentTaskSessionRecord>> {
  const document = await readSessionRegistry(vaultRoot)
  return document.sessions
}

export async function upsertAgentTaskSessionRecord(vaultRoot: string, record: AgentTaskSessionRecord): Promise<AgentTaskSessionRecord> {
  return await mutateSessionRegistry(vaultRoot, async (document) => {
    const sessions = document.sessions.filter((entry) => !(entry.agentId === record.agentId && entry.taskId === record.taskId))
    document.sessions = [...sessions, record]
    return record
  })
}

export async function clearAgentTaskSessionRecord(vaultRoot: string, agentId: string, taskId: string, sessionId?: string | null): Promise<void> {
  await mutateSessionRegistry(vaultRoot, async (document) => {
    document.sessions = document.sessions.filter((entry) => {
      if (entry.agentId !== agentId || entry.taskId !== taskId) return true
      if (sessionId && entry.sessionId !== sessionId) return true
      return false
    })
  })
}

export async function markAgentTaskSessionStopped(vaultRoot: string, agentId: string, taskId: string, sessionId: string, now: Date = new Date()): Promise<void> {
  await mutateSessionRegistry(vaultRoot, async (document) => {
    const existing = document.sessions.find((entry) => entry.agentId === agentId && entry.taskId === taskId)
    const sessions = document.sessions.filter((entry) => !(entry.agentId === agentId && entry.taskId === taskId))
    document.sessions = [
      ...sessions,
      {
        agentId,
        taskId,
        sessionId,
        status: "stopped",
        updatedAt: now.toISOString(),
        ...(existing?.projectId ? { projectId: existing.projectId } : {}),
      },
    ]
  })
}

export async function cleanupStaleAgentTaskSessionRecords(vaultRoot: string, now: Date = new Date()): Promise<number> {
  return await mutateSessionRegistry(vaultRoot, async (document) => {
    let updated = 0
    document.sessions = document.sessions.map((entry) => {
      if (entry.status !== "active") return entry
      const runner = agentRunnerManager.getRunner(entry.sessionId)
      if (runner && isRunnerSessionReusable(runner)) return entry
      updated += 1
      return {
        ...entry,
        status: "stopped",
        updatedAt: now.toISOString(),
      }
    })
    return updated
  })
}
