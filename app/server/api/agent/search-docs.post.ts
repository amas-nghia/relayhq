import { createError, defineEventHandler, getQuery, readBody } from "h3";

import { DOC_TYPES, type DocType } from "../../../shared/vault/schema";
import type { VaultReadModel } from "../../models/read-model";
import { filterDocsForAgent, resolveAgentDocumentAccessContext } from "../../services/authz/doc-access";
import { countTokens, computeSaving, recordTokenSaving } from "../../services/metrics/tracker";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

type SearchField = "title" | "tags" | "body";

interface SearchBreakdown {
  readonly title_phrase: number;
  readonly title_terms: number;
  readonly tags_phrase: number;
  readonly tags_terms: number;
  readonly body_phrase: number;
  readonly body_terms: number;
  readonly matched_terms: number;
}

interface RankedDoc {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly excerpt: string;
  readonly path: string;
  readonly score: number;
  readonly matched_fields: ReadonlyArray<SearchField>;
  readonly score_breakdown: SearchBreakdown;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function countOccurrences(content: string, needle: string) {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = 0;
  while ((index = content.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

function tokenizeQuery(query: string) {
  return [...new Set(normalizeText(query).split(/[^\p{L}\p{N}-]+/u).filter((term) => term.length > 0))];
}

function clampLimit(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(value)));
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()) : [];
}

function scoreField(content: string, normalizedQuery: string, terms: ReadonlyArray<string>, weights: { phrase: number; term: number }) {
  const normalizedContent = normalizeText(content);
  const phraseMatches = countOccurrences(normalizedContent, normalizedQuery);
  const termMatches = terms.reduce((sum, term) => sum + countOccurrences(normalizedContent, term), 0);
  const matchedTerms = terms.filter((term) => normalizedContent.includes(term)).length;
  return {
    phraseMatches,
    termMatches,
    matchedTerms,
    score: (phraseMatches * weights.phrase) + (termMatches * weights.term),
  };
}

function buildExcerpt(content: string, normalizedQuery: string, terms: ReadonlyArray<string>) {
  const normalized = content.replace(/\s+/g, " ").trim();
  const excerptNeedles = [normalizedQuery, ...terms].filter((needle) => needle.length > 0);
  const bestNeedle = excerptNeedles
    .map((needle) => ({ needle, index: normalized.toLocaleLowerCase().indexOf(needle) }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => left.index - right.index || right.needle.length - left.needle.length)[0];

  if (!bestNeedle) return normalized.slice(0, 220);

  const start = Math.max(0, bestNeedle.index - 100);
  const end = Math.min(normalized.length, bestNeedle.index + bestNeedle.needle.length + 140);
  return normalized.slice(start, end);
}

function rankDoc(doc: VaultReadModel["docs"][number], normalizedQuery: string, terms: ReadonlyArray<string>): RankedDoc | null {
  const title = scoreField(doc.title, normalizedQuery, terms, { phrase: 40, term: 12 });
  const tags = scoreField(doc.tags.join(" "), normalizedQuery, terms, { phrase: 24, term: 8 });
  const body = scoreField(doc.body, normalizedQuery, terms, { phrase: 6, term: 2 });
  const matchedTerms = new Set<string>();
  for (const term of terms) {
    if ([doc.title, doc.tags.join(" "), doc.body].some((value) => normalizeText(value).includes(term))) {
      matchedTerms.add(term);
    }
  }

  const score = title.score + tags.score + body.score + (matchedTerms.size * 5);
  if (score === 0) return null;

  const matchedFields: SearchField[] = [];
  if (title.score > 0) matchedFields.push("title");
  if (tags.score > 0) matchedFields.push("tags");
  if (body.score > 0) matchedFields.push("body");

  const excerptSource = body.score > 0
    ? doc.body
    : title.score > 0
      ? doc.title
      : doc.tags.join(" ");

  return {
    id: doc.id,
    type: doc.docType,
    title: doc.title,
    excerpt: buildExcerpt(excerptSource, normalizedQuery, terms),
    path: doc.sourcePath,
    score,
    matched_fields: matchedFields,
    score_breakdown: {
      title_phrase: title.phraseMatches,
      title_terms: title.termMatches,
      tags_phrase: tags.phraseMatches,
      tags_terms: tags.termMatches,
      body_phrase: body.phraseMatches,
      body_terms: body.termMatches,
      matched_terms: matchedTerms.size,
    },
  };
}

export async function searchAgentDocs(body: unknown, options: { vaultRoot?: string; readModel?: VaultReadModel } = {}) {
  if (!isPlainRecord(body) || typeof body.query !== "string" || body.query.trim().length === 0) {
    throw createError({ statusCode: 422, statusMessage: "query is required." });
  }

  const query = body.query.trim();
  const normalizedQuery = normalizeText(query);
  const queryTerms = tokenizeQuery(query);
  const requestedTypes = readStringArray(body.types).filter((value): value is DocType => (DOC_TYPES as readonly string[]).includes(value));
  const requestedRoles = readStringArray(body.roles);
  const requestedTags = readStringArray(body.tags).map((tag) => tag.toLocaleLowerCase());
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const agentId = typeof body.agent_id === "string" ? body.agent_id : null;
  const requestedStatus = typeof body.status === "string" ? body.status.trim() : undefined;
  const limit = clampLimit(body.limit);
  const readModel = options.readModel ?? await readCanonicalVaultReadModel(options.vaultRoot ?? resolveVaultWorkspaceRoot());
  const allowedDocs = filterDocsForAgent(readModel, resolveAgentDocumentAccessContext(readModel, agentId, requestedRoles)).allowed;

  const docs = allowedDocs
    .filter((doc) => requestedTypes.length === 0 || requestedTypes.includes(doc.docType as DocType))
    .filter((doc) => projectId === undefined || doc.projectId === projectId)
    .filter((doc) => requestedStatus === undefined || doc.status === requestedStatus)
    .filter((doc) => requestedTags.length === 0 || doc.tags.some((tag) => requestedTags.includes(tag.toLocaleLowerCase())))
    .map((doc) => rankDoc(doc, normalizedQuery, queryTerms))
    .filter((doc): doc is NonNullable<typeof doc> => doc !== null)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, limit);

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
