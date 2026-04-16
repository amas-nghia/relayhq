import type {
  ReadModelApproval,
  ReadModelBoard,
  ReadModelProject,
  ReadModelTask,
  VaultReadModel,
} from "../../models/read-model";
import type { KiokuSearchClient, KiokuSearchHit } from "./client";
import type { KiokuWorkStateEntityType } from "./indexer";

export type { KiokuSearchClient, KiokuSearchHit } from "./client";

export interface KiokuRetrievalResult {
  readonly query: string;
  readonly hits: ReadonlyArray<KiokuSearchHit>;
  readonly projects: ReadonlyArray<ReadModelProject>;
  readonly boards: ReadonlyArray<ReadModelBoard>;
  readonly tasks: ReadonlyArray<ReadModelTask>;
  readonly approvals: ReadonlyArray<ReadModelApproval>;
}

function uniqueById<T extends { readonly id: string }>(items: ReadonlyArray<T>): ReadonlyArray<T> {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function resolveEntities<T extends { readonly id: string }>(items: ReadonlyArray<T>, ids: ReadonlyArray<string>): ReadonlyArray<T> {
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const resolved = ids.map((id) => byId.get(id)).filter((item): item is T => item !== undefined);
  return uniqueById(resolved);
}

function collectHitIds(hits: ReadonlyArray<KiokuSearchHit>, entityType: KiokuWorkStateEntityType): ReadonlyArray<string> {
  return hits.filter((hit) => hit.entityType === entityType).map((hit) => hit.entityId);
}

export function resolveKiokuRetrieval(readModel: VaultReadModel, hits: ReadonlyArray<KiokuSearchHit>, query: string): KiokuRetrievalResult {
  return {
    query,
    hits,
    projects: resolveEntities(readModel.projects, collectHitIds(hits, "project")),
    boards: resolveEntities(readModel.boards, collectHitIds(hits, "board")),
    tasks: resolveEntities(readModel.tasks, collectHitIds(hits, "task")),
    approvals: resolveEntities(readModel.approvals, collectHitIds(hits, "approval")),
  };
}

export async function retrieveKiokuCanonicalState(
  readModel: VaultReadModel,
  searchClient: KiokuSearchClient,
  query: string,
): Promise<KiokuRetrievalResult> {
  const hits = await searchClient.search(query);
  return resolveKiokuRetrieval(readModel, hits, query);
}
