import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createError, defineEventHandler, readBody } from "h3";

import { readConfiguredWorkspaceId, resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../../services/vault/runtime";
import { readCanonicalVaultReadModel } from "../../services/vault/read";

type ProjectCreateResponse = {
  project: { id: string; name: string; codebaseRoot: string | null };
  board: { id: string; name: string };
  columns: ReadonlyArray<{ id: string; name: string }>;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function yaml(frontmatter: Record<string, string | number | null>): string {
  return `---\n${Object.entries(frontmatter).map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`).join("\n")}\n---\n\n`;
}

export async function createVaultProject(body: unknown, options: { vaultRoot?: string; now?: Date } = {}): Promise<ProjectCreateResponse> {
  if (!isPlainRecord(body) || typeof body.name !== "string" || body.name.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: "name is required." });
  }

  const name = body.name.trim();
  const codebaseRoot = typeof body.codebaseRoot === "string" && body.codebaseRoot.trim().length > 0 ? body.codebaseRoot.trim() : null;
  const slug = slugify(name);
  const suffix = randomUUID().slice(0, 6);
  const projectId = `project-${slug}-${suffix}`;
  const boardId = `board-${slug}-${suffix}`;
  const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
  const sharedRoot = resolveSharedVaultPath(vaultRoot);
  const readModel = await readCanonicalVaultReadModel(vaultRoot);
  const workspaceId = readConfiguredWorkspaceId() ?? readModel.workspaces[0]?.id;

  if (!workspaceId) {
    throw createError({ statusCode: 422, statusMessage: "No workspace is available for project creation." });
  }

  const columns = [
    { id: `col-todo-${suffix}`, name: "To Do", position: 0 },
    { id: `col-inprogress-${suffix}`, name: "In Progress", position: 1 },
    { id: `col-review-${suffix}`, name: "Review", position: 2 },
    { id: `col-done-${suffix}`, name: "Done", position: 3 },
  ] as const;
  const timestamp = (options.now ?? new Date()).toISOString();

  await mkdir(join(sharedRoot, "projects"), { recursive: true });
  await mkdir(join(sharedRoot, "boards"), { recursive: true });
  await mkdir(join(sharedRoot, "columns"), { recursive: true });

  try {
    await writeFile(join(sharedRoot, "projects", `${projectId}.md`), yaml({ id: projectId, type: "project", workspace_id: workspaceId, name, codebase_root: codebaseRoot, created_at: timestamp, updated_at: timestamp }) + `# ${name}\n`, { flag: "wx" });
    await writeFile(join(sharedRoot, "boards", `${boardId}.md`), yaml({ id: boardId, type: "board", workspace_id: workspaceId, project_id: projectId, name: `${name} Board`, created_at: timestamp, updated_at: timestamp }) + `# ${name} Board\n`, { flag: "wx" });
    for (const column of columns) {
      await writeFile(join(sharedRoot, "columns", `${column.id}.md`), yaml({ id: column.id, type: "column", workspace_id: workspaceId, project_id: projectId, board_id: boardId, name: column.name, position: column.position, created_at: timestamp, updated_at: timestamp }) + `${column.name}\n`, { flag: "wx" });
    }
  } catch {
    throw createError({ statusCode: 409, statusMessage: `Project ${projectId} already exists.` });
  }

  return {
    project: { id: projectId, name, codebaseRoot },
    board: { id: boardId, name: `${name} Board` },
    columns: columns.map(({ id, name: columnName }) => ({ id, name: columnName })),
  };
}

export default defineEventHandler(async (event) => {
  const result = await createVaultProject(await readBody(event));
  event.node.res.statusCode = 201;
  return result;
});
