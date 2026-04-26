import { createError, defineEventHandler, getQuery, readBody } from "h3";

import { searchKiokuCanonicalState } from "../kioku/search.post";
import { getKiokuStorage } from "../../services/kioku/storage";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../services/vault/runtime";
import { countTokens, computeSaving, recordTokenSaving } from "../../services/metrics/tracker";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function searchAgentContext(body: unknown) {
  return searchAgentContextWith(body, searchKiokuCanonicalState)
}

export async function searchAgentContextWith(
  body: unknown,
  searchFn: typeof searchKiokuCanonicalState,
) {
  if (!isPlainRecord(body) || typeof body.query !== "string" || body.query.trim().length === 0) {
    throw createError({ statusCode: 422, statusMessage: "query is required." });
  }

  const result = await searchFn(body.query.trim(), {
    readModel: await readCanonicalVaultReadModel(resolveVaultWorkspaceRoot()),
    storage: getKiokuStorage(),
  });

  return {
    query: result.query,
    tasks: result.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee,
      boardId: task.boardId,
      projectId: task.projectId,
      updatedAt: task.updatedAt,
    })),
    projects: result.projects.map((project) => ({ id: project.id, name: project.name })),
    boards: result.boards.map((board) => ({ id: board.id, name: board.name, projectId: board.projectId })),
    docs: result.docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      doc_type: doc.docType,
      status: doc.status,
      visibility: doc.visibility,
      updatedAt: doc.updatedAt,
      projectId: doc.projectId,
    })),
  };
}

export default defineEventHandler(async (event) => {
  const agent = String(getQuery(event).agent ?? "anonymous");
  const response = await searchAgentContext(await readBody(event));
  const responseTokens = countTokens(response);
  const { baselineTokens, savedTokens } = computeSaving("search", responseTokens);
  recordTokenSaving({ timestamp: new Date().toISOString(), agent, endpoint: "search", responseTokens, baselineTokens, savedTokens });
  return response;
});
