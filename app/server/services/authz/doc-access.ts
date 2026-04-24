import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ReadModelAgent, ReadModelDoc, VaultReadModel } from "../../models/read-model";

export interface AgentDocumentAccessContext {
  readonly agentId: string | null;
  readonly roles: ReadonlyArray<string>;
}

function normalizeRoles(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right));
}

function matchesRole(accessRoles: ReadonlyArray<string>, roles: ReadonlyArray<string>): boolean {
  return roles.some((role) => accessRoles.includes(role) || accessRoles.includes(`role:${role}`));
}

export function resolveAgentDocumentAccessContext(readModel: VaultReadModel, agentId: string | null, requestedRoles: ReadonlyArray<string> = []): AgentDocumentAccessContext {
  const agent = agentId === null ? null : readModel.agents.find((entry) => entry.id === agentId) ?? null;
  return {
    agentId,
    roles: normalizeRoles([...(agent?.roles ?? []), ...requestedRoles]),
  };
}

export function canAgentReadDoc(doc: ReadModelDoc, context: AgentDocumentAccessContext): boolean {
  const accessRoles = doc.accessRoles;

  if (accessRoles.includes("human-only")) {
    return false;
  }

  if (doc.sensitive) {
    return context.agentId !== null && accessRoles.includes(context.agentId);
  }

  if (doc.visibility === "private") {
    return context.agentId !== null && accessRoles.includes(context.agentId);
  }

  if (accessRoles.includes("all")) {
    return true;
  }

  if (context.agentId !== null && accessRoles.includes(context.agentId)) {
    return true;
  }

  return matchesRole(accessRoles, context.roles);
}

export function filterDocsForAgent(readModel: VaultReadModel, context: AgentDocumentAccessContext) {
  const allowed: ReadonlyArray<ReadModelDoc> = [];
  const denied: ReadonlyArray<ReadModelDoc> = [];
  const nextAllowed: ReadModelDoc[] = [];
  const nextDenied: ReadModelDoc[] = [];

  for (const doc of readModel.docs) {
    if (canAgentReadDoc(doc, context)) {
      nextAllowed.push(doc);
    } else {
      nextDenied.push(doc);
    }
  }

  return {
    allowed: nextAllowed as typeof allowed,
    denied: nextDenied as typeof denied,
  };
}

export async function writeDeniedDocAccessAudit(options: {
  vaultRoot: string;
  agentId: string;
  deniedDocIds: ReadonlyArray<string>;
  now?: Date;
}) {
  if (options.deniedDocIds.length === 0) return;

  const now = options.now ?? new Date();
  const auditDir = join(options.vaultRoot, "vault", "shared", "audit");
  await mkdir(auditDir, { recursive: true });
  const id = `audit-${randomUUID()}`;
  const content = [
    "---",
    `id: ${JSON.stringify(id)}`,
    'type: "audit-note"',
    'task_id: "system-agent-context"',
    `message: ${JSON.stringify(`Agent ${options.agentId} was denied access to docs: ${options.deniedDocIds.join(", ")}`)}`,
    `source: ${JSON.stringify(options.agentId)}`,
    "confidence: 1",
    `created_at: ${JSON.stringify(now.toISOString())}`,
    "---",
    "",
    "Denied doc access was recorded automatically by RelayHQ.",
    "",
  ].join("\n");
  await writeFile(join(auditDir, `${id}.md`), content, { encoding: "utf8", flag: "wx" });
}
