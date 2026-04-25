import { execSync } from "node:child_process";

import { createError } from "h3";

import { runHttpAgentAdapter } from "./http-adapter";
import { agentRunnerManager } from "../runners/manager";
import { writeAuditNote } from "../vault/audit-write";
import { claimTaskLifecycle } from "../vault/task-lifecycle";
import { resolveVaultWorkspaceRoot } from "../vault/runtime";
import { readTaskDocument } from "../vault/write";
import { readCanonicalVaultReadModel } from "../vault/read";

function readSection(body: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = body.match(new RegExp(`(?:^|\\n)##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i'))
  const value = match?.[1]?.trim()
  return value && value.length > 0 ? value : null
}

function ensureCommandAvailable(command: string): void {
  try {
    const path = execSync(`command -v ${command}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (path.length === 0) throw new Error("missing command");
  } catch {
    throw createError({ statusCode: 422, statusMessage: `${command} CLI was not found on PATH.` });
  }
}

function providerCommand(provider: string): string {
  if (provider === "claude") return "claude";
  if (provider === "opencode") return "opencode";
  return provider;
}

function buildPrompt(taskId: string, vaultRoot: string, body: string): string {
  const objective = readSection(body, "Objective") ?? "Complete the assigned task."
  const acceptanceCriteria = readSection(body, "Acceptance Criteria") ?? ""
  const contextFiles = readSection(body, "Context Files") ?? ""
  return [
    `Task ID: ${taskId}`,
    `Vault root: ${vaultRoot}`,
    `Objective:\n${objective}`,
    acceptanceCriteria ? `Acceptance Criteria:\n${acceptanceCriteria}` : null,
    contextFiles ? `Context Files:\n${contextFiles}` : null,
  ].filter(Boolean).join("\n\n")
}

export async function startTaskAutorun(taskId: string): Promise<{ runnerId: string; command: string }> {
  const vaultRoot = resolveVaultWorkspaceRoot()
  const task = await readTaskDocument(`${vaultRoot}/vault/shared/tasks/${taskId}.md`)
  const assignee = task.frontmatter.assignee
  if (!assignee || assignee === "unassigned") {
    throw createError({ statusCode: 422, statusMessage: "Task must be assigned to an agent before auto-run can start." })
  }

  const model = await readCanonicalVaultReadModel(vaultRoot)
  const agent = model.agents.find((entry) => entry.id === assignee)
  const provider = agent?.provider ?? (assignee.startsWith("claude") || assignee.includes("claude") ? "claude" : assignee)
  const command = providerCommand(provider)

  await claimTaskLifecycle({ taskId, actorId: assignee, assignee, vaultRoot })

  const prompt = buildPrompt(taskId, vaultRoot, task.body)

  if ((provider === "codex" || provider === "openai") && agent?.apiKeyRef) {
    await writeAuditNote({ vaultRoot, taskId, source: assignee, message: `http adapter started for ${provider}` })
    void runHttpAgentAdapter({
      vaultRoot,
      taskId,
      agentId: assignee,
      provider,
      model: agent.model,
      apiKeyRef: agent.apiKeyRef,
      prompt,
    }).catch((error) => {
      void writeAuditNote({ vaultRoot, taskId, source: assignee, message: `http adapter failed: ${error instanceof Error ? error.message : String(error)}` }).catch(() => undefined)
    })
    return { runnerId: `http-${taskId}`, command: `${provider}:chat-completions` }
  }

  ensureCommandAvailable(command)
  const runner = agentRunnerManager.startRunner({
    agentName: assignee,
    taskId,
    provider,
    prompt,
    onStdout: (chunk) => {
      const text = chunk.trim()
      if (text.length === 0) return
      void writeAuditNote({ vaultRoot, taskId, source: assignee, message: `autorun stdout: ${text.slice(0, 500)}` }).catch(() => undefined)
    },
    onStderr: (chunk) => {
      const text = chunk.trim()
      if (text.length === 0) return
      void writeAuditNote({ vaultRoot, taskId, source: assignee, message: `autorun stderr: ${text.slice(0, 500)}` }).catch(() => undefined)
    },
    onError: (error) => {
      void writeAuditNote({ vaultRoot, taskId, source: assignee, message: `autorun failed: ${error.message}` }).catch(() => undefined)
    },
  })

  await writeAuditNote({ vaultRoot, taskId, source: assignee, message: `autorun started with ${command}` })
  return { runnerId: runner.id, command: runner.command }
}
