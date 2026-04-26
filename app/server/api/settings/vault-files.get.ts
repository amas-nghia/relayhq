import { defineEventHandler } from "h3";

import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export interface VaultFilePickerEntry {
  readonly path: string;
  readonly label: string;
  readonly kind: string;
}

export async function listVaultFiles(options: { vaultRoot?: string } = {}): Promise<ReadonlyArray<VaultFilePickerEntry>> {
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const model = await readCanonicalVaultReadModel(vaultRoot);

  const entries: VaultFilePickerEntry[] = [
    ...model.workspaces.map((item) => ({ path: item.sourcePath, label: item.name, kind: "workspace" })),
    ...model.projects.map((item) => ({ path: item.sourcePath, label: item.name, kind: "project" })),
    ...model.boards.map((item) => ({ path: item.sourcePath, label: item.name, kind: "board" })),
    ...model.columns.map((item) => ({ path: item.sourcePath, label: item.name, kind: "column" })),
    ...model.tasks.map((item) => ({ path: item.sourcePath, label: item.title, kind: "task" })),
    ...model.issues.map((item) => ({ path: item.sourcePath, label: item.title, kind: "issue" })),
    ...model.docs.map((item) => ({ path: item.sourcePath, label: item.title, kind: "doc" })),
    ...model.approvals.map((item) => ({ path: item.sourcePath, label: item.id, kind: "approval" })),
    ...model.auditNotes.map((item) => ({ path: item.sourcePath, label: item.id, kind: "audit-note" })),
    ...model.agents.map((item) => ({ path: item.sourcePath, label: item.name, kind: "agent" })),
  ];

  const unique = new Map<string, VaultFilePickerEntry>();
  for (const entry of entries) {
    unique.set(entry.path, entry);
  }

  return [...unique.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export default defineEventHandler(async () => {
  return await listVaultFiles();
});
