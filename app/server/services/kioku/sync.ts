import type { VaultReadModel } from "../../models/read-model";
import { buildKiokuIndexUpdates } from "./indexer";
import type { KiokuStorage } from "./storage";

export interface KiokuSyncSummary {
  readonly totalDocuments: number;
  readonly upsertedIds: ReadonlyArray<string>;
  readonly deletedIds: ReadonlyArray<string>;
}

export function syncReadModelToKioku(readModel: VaultReadModel, storage: Pick<KiokuStorage, "upsert" | "deleteById" | "listEntityIds" | "fetchById">): KiokuSyncSummary {
  const updates = buildKiokuIndexUpdates(readModel);
  const upsertedIds = updates.map((update) => update.document.entityId);
  const desiredIds = new Set(upsertedIds);

  for (const update of updates) {
    storage.upsert(update.document);
  }

  const deletedIds = storage.listEntityIds().filter((entityId) => {
    const existing = storage.fetchById(entityId);
    return existing?.entityType !== "document" && !desiredIds.has(entityId);
  });
  for (const entityId of deletedIds) {
    storage.deleteById(entityId);
  }

  return {
    totalDocuments: updates.length,
    upsertedIds,
    deletedIds,
  };
}
