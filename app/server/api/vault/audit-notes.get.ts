import { defineEventHandler } from "h3";

import { filterVaultReadModelByWorkspaceId, type VaultReadModel } from "../../models/read-model";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { readConfiguredWorkspaceId, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export interface AuditNoteResponse {
  readonly id: string;
  readonly taskId: string;
  readonly message: string;
  readonly source: string;
  readonly confidence: number;
  readonly createdAt: string;
  readonly sourcePath: string;
}

interface AuditNotesPayload {
  readonly auditNotes: ReadonlyArray<AuditNoteResponse>;
}

interface ReadAuditNotesDependencies {
  readonly readModelReader?: (vaultRoot: string) => Promise<VaultReadModel>;
  readonly resolveRoot?: () => string;
  readonly workspaceIdReader?: () => string | null;
}

function toAuditNoteResponse(model: VaultReadModel): AuditNotesPayload {
  return {
    auditNotes: [...model.auditNotes]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((note) => ({
        id: note.id,
        taskId: note.taskId,
        message: note.message,
        source: note.source,
        confidence: note.confidence,
        createdAt: note.createdAt,
        sourcePath: note.sourcePath,
      })),
  };
}

export async function readAuditNotes(
  dependencies: ReadAuditNotesDependencies = {},
): Promise<AuditNotesPayload> {
  const readModelReader = dependencies.readModelReader ?? readCanonicalVaultReadModel;
  const resolveRoot = dependencies.resolveRoot ?? resolveVaultWorkspaceRoot;
  const workspaceIdReader = dependencies.workspaceIdReader ?? readConfiguredWorkspaceId;
  const readModel = await readModelReader(resolveRoot());
  const configuredWorkspaceId = workspaceIdReader();
  const filteredReadModel = configuredWorkspaceId === null
    ? readModel
    : filterVaultReadModelByWorkspaceId(readModel, configuredWorkspaceId);

  return toAuditNoteResponse(filteredReadModel);
}

export default defineEventHandler(async () => readAuditNotes());
