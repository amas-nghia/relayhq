import { createError } from "h3";

import { writeAuditNote } from "../vault/audit-write";
import { patchTaskLifecycle } from "../vault/task-lifecycle";

function resolveSecretRef(apiKeyRef: string, env: NodeJS.ProcessEnv): string {
  if (!apiKeyRef.startsWith("env:")) {
    throw createError({ statusCode: 422, statusMessage: "Only env: api_key_ref values are supported for HTTP adapters." })
  }
  const keyName = apiKeyRef.slice(4)
  const keyValue = env[keyName]
  if (!keyValue || keyValue.trim().length === 0) {
    throw createError({ statusCode: 422, statusMessage: `Missing environment variable ${keyName} for HTTP adapter auth.` })
  }
  return keyValue.trim()
}

export async function runHttpAgentAdapter(options: {
  readonly vaultRoot: string
  readonly taskId: string
  readonly agentId: string
  readonly provider: string
  readonly model: string
  readonly apiKeyRef: string
  readonly prompt: string
  readonly env?: NodeJS.ProcessEnv
}): Promise<void> {
  const env = options.env ?? process.env
  const apiKey = resolveSecretRef(options.apiKeyRef, env)
  const baseUrl = env.OPENAI_BASE_URL || "https://api.openai.com/v1"
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      stream: true,
      messages: [
        { role: "system", content: "You are an autonomous coding agent working inside RelayHQ. Return concise progress and a final completion summary." },
        { role: "user", content: options.prompt },
      ],
    }),
  })

  if (!response.ok || !response.body) {
    throw createError({ statusCode: 502, statusMessage: `HTTP adapter request failed with status ${response.status}.` })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let finalText = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    finalText += chunk
    const visibleChunk = chunk.trim()
    if (visibleChunk.length > 0) {
      await writeAuditNote({
        vaultRoot: options.vaultRoot,
        taskId: options.taskId,
        source: options.agentId,
        message: `http adapter chunk: ${visibleChunk.slice(0, 500)}`,
      })
    }
  }

  await patchTaskLifecycle({
    taskId: options.taskId,
    actorId: options.agentId,
    patch: {
      status: "done",
      column: "done",
      progress: 100,
      model: options.model,
      result: finalText.slice(0, 4000) || `${options.provider} adapter completed without final text.`,
      completed_at: new Date().toISOString(),
    },
    vaultRoot: options.vaultRoot,
  })
}
