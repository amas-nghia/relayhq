import type { ReadModelDoc, ReadModelTask, VaultReadModel } from "../../models/read-model";
import { filterDocsForAgent, resolveAgentDocumentAccessContext } from "./doc-access";

export interface RelevantDocSummary {
  readonly id: string;
  readonly title: string;
  readonly doc_type: string;
  readonly path: string;
  readonly summary: string;
}

function scoreDoc(doc: ReadModelDoc, task: ReadModelTask) {
  let score = 0;
  if (doc.projectId === task.projectId) score += 10;
  if (["brief", "plan", "sop"].includes(doc.docType)) score += 5;
  if (doc.tags.some((tag) => task.tags.includes(tag))) score += 3;
  return score;
}

function summarize(body: string) {
  return body.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function getRelevantDocsForTask(readModel: VaultReadModel, task: ReadModelTask, options: { agentId?: string | null; requestedRoles?: ReadonlyArray<string> } = {}): ReadonlyArray<RelevantDocSummary> {
  const context = resolveAgentDocumentAccessContext(readModel, options.agentId ?? null, options.requestedRoles ?? []);
  return filterDocsForAgent(readModel, context).allowed
    .filter((doc) => doc.projectId === task.projectId)
    .sort((left, right) => scoreDoc(right, task) - scoreDoc(left, task) || left.title.localeCompare(right.title))
    .slice(0, 5)
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      doc_type: doc.docType,
      path: doc.sourcePath,
      summary: summarize(doc.body),
    }));
}
