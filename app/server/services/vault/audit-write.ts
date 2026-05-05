import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeAuditNote(options: {
  vaultRoot: string;
  taskId: string;
  source: string;
  message: string;
  confidence?: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  tokensUsed?: number | null;
  model?: string | null;
  costUsd?: number | null;
  usageSource?: "provider" | "runtime" | "estimated" | null;
  now?: Date;
}) {
  const now = options.now ?? new Date();
  const id = `audit-${randomUUID().slice(0, 8)}`;
  const auditDir = join(options.vaultRoot, "vault", "shared", "audit");
  await mkdir(auditDir, { recursive: true });
  const content = [
    "---",
    `id: ${JSON.stringify(id)}`,
    'type: "audit-note"',
    `task_id: ${JSON.stringify(options.taskId)}`,
    `message: ${JSON.stringify(options.message)}`,
    `source: ${JSON.stringify(options.source)}`,
    `confidence: ${options.confidence ?? 1}`,
    ...(options.promptTokens === undefined ? [] : [`prompt_tokens: ${options.promptTokens === null ? "null" : options.promptTokens}`]),
    ...(options.completionTokens === undefined ? [] : [`completion_tokens: ${options.completionTokens === null ? "null" : options.completionTokens}`]),
    ...(options.tokensUsed === undefined ? [] : [`tokens_used: ${options.tokensUsed === null ? "null" : options.tokensUsed}`]),
    ...(options.model === undefined ? [] : [`model: ${options.model === null ? "null" : JSON.stringify(options.model)}`]),
    ...(options.costUsd === undefined ? [] : [`cost_usd: ${options.costUsd === null ? "null" : options.costUsd}`]),
    ...(options.usageSource === undefined ? [] : [`usage_source: ${options.usageSource === null ? "null" : JSON.stringify(options.usageSource)}`]),
    `created_at: ${JSON.stringify(now.toISOString())}`,
    "---",
    "",
  ].join("\n");
  await writeFile(join(auditDir, `${id}.md`), content, "utf8");
}
