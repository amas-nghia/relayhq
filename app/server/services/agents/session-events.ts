import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface AgentSessionEvent {
  readonly id: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly taskId: string | null;
  readonly type: 'session.started' | 'session.ended' | 'session.failed' | 'terminal.stdout' | 'terminal.stderr' | 'reasoning.summary' | 'user.message';
  readonly timestamp: string;
  readonly text?: string;
  readonly code?: number | null;
}

function resolveEventLogPath(vaultRoot: string, sessionId: string): string {
  return join(vaultRoot, 'vault', 'shared', 'threads', `agent-session-${sessionId}.jsonl`)
}

function normalizeText(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '').trim()
}

const eventLogWriteChains = new Map<string, Promise<void>>()

export async function appendAgentSessionEvent(vaultRoot: string, event: Omit<AgentSessionEvent, 'id'>): Promise<void> {
  const filePath = resolveEventLogPath(vaultRoot, event.sessionId)
  const record: AgentSessionEvent = {
    ...event,
    id: `${event.sessionId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    ...(event.text === undefined ? {} : { text: normalizeText(event.text) }),
  }
  const line = `${JSON.stringify(record)}\n`
  const previousWrite = eventLogWriteChains.get(filePath) ?? Promise.resolve()
  const nextWrite = previousWrite
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(filePath), { recursive: true })
      await appendFile(filePath, line, 'utf8')
    })
  eventLogWriteChains.set(filePath, nextWrite)
  await nextWrite
}

export async function readAgentSessionEvents(vaultRoot: string, sessionId: string): Promise<ReadonlyArray<AgentSessionEvent>> {
  const filePath = resolveEventLogPath(vaultRoot, sessionId)
  try {
    const content = await readFile(filePath, 'utf8')
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as AgentSessionEvent]
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}
