import { createError, defineEventHandler, getQuery, readBody } from "h3";

import type { DocType } from "../../../shared/vault/schema";
import type { VaultReadModel } from "../../models/read-model";
import { filterDocsForAgent, resolveAgentDocumentAccessContext } from "../../services/authz/doc-access";
import { countTokens, computeSaving, recordTokenSaving } from "../../services/metrics/tracker";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countOccurrences(content: string, needle: string) {
  let count = 0;
  let index = 0;
  while ((index = content.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

function buildExcerpt(content: string, needle: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  const index = normalized.indexOf(needle);
  if (index === -1) return normalized.slice(0, 200);
  const start = Math.max(0, index - 80);
  const end = Math.min(normalized.length, index + needle.length + 120);
  return normalized.slice(start, end);
}

export async function searchAgentDocs(body: unknown, options: { vaultRoot?: string; readModel?: VaultReadModel } = {}) {
  if (!isPlainRecord(body) || typeof body.query !== "string" || body.query.trim().length === 0) {
    throw createError({ statusCode: 422, statusMessage: "query is required." });
  }

  const query = body.query.trim();
  const normalizedQuery = query.toLocaleLowerCase();
  const requestedTypes = Array.isArray(body.types) ? body.types.filter((value): value is DocType => typeof value === "string") : [];
  const requestedRoles = Array.isArray(body.roles) ? body.roles.filter((value): value is string => typeof value === "string") : [];
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const agentId = typeof body.agent_id === "string" ? body.agent_id : null;
  const readModel = options.readModel ?? await readCanonicalVaultReadModel(options.vaultRoot ?? resolveVaultWorkspaceRoot());
  const allowedDocs = filterDocsForAgent(readModel, resolveAgentDocumentAccessContext(readModel, agentId, requestedRoles)).allowed;

  const docs = allowedDocs
    .filter((doc) => requestedTypes.length === 0 || requestedTypes.includes(doc.docType as DocType))
    .filter((doc) => projectId === undefined || doc.projectId === projectId)
    .map((doc) => {
      const haystack = [doc.title, doc.tags.join(" "), doc.body].join(" \n ").toLocaleLowerCase();
      const score = countOccurrences(haystack, normalizedQuery);
      return score === 0 ? null : {
        id: doc.id,
        type: doc.docType,
        title: doc.title,
        excerpt: buildExcerpt([doc.title, doc.tags.join(" "), doc.body].join("\n"), normalizedQuery),
        path: doc.sourcePath,
        score,
      };
    })
    .filter((doc): doc is NonNullable<typeof doc> => doc !== null)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, 10);

  return { query, docs };
}

export default defineEventHandler(async (event) => {
  const agent = String(getQuery(event).agent ?? getQuery(event).agent_id ?? "anonymous");
  const response = await searchAgentDocs(await readBody(event));
  const responseTokens = countTokens(response);
  const { baselineTokens, savedTokens } = computeSaving("search-docs", responseTokens);
  recordTokenSaving({ timestamp: new Date().toISOString(), agent, endpoint: "search-docs", responseTokens, baselineTokens, savedTokens });
  return response;
});
