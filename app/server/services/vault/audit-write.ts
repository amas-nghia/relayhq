import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function writeAuditNote(options: {
  vaultRoot: string;
  taskId: string;
  source: string;
  message: string;
  confidence?: number;
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
    `created_at: ${JSON.stringify(now.toISOString())}`,
    "---",
    "",
  ].join("\n");
  await writeFile(join(auditDir, `${id}.md`), content, "utf8");
}
