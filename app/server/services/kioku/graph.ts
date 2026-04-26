import type { KiokuIndexDocument } from "./indexer";
import type { KiokuStorage } from "./storage";

export interface KiokuGraphNode {
  readonly id: string;
  readonly label: string;
  readonly type: "doc" | "attachment" | "task";
  readonly projectId: string | null;
  readonly updatedAt: string;
}

export interface KiokuGraphEdge {
  readonly source: string;
  readonly target: string;
  readonly score: number;
}

export interface KiokuGraphResponse {
  readonly nodes: ReadonlyArray<KiokuGraphNode>;
  readonly edges: ReadonlyArray<KiokuGraphEdge>;
}

interface GraphOptions {
  readonly projectId?: string;
  readonly threshold?: number;
}

interface GraphRecord {
  readonly node: KiokuGraphNode;
  readonly tokens: ReadonlySet<string>;
}

function isDocumentEntity(document: KiokuIndexDocument): boolean {
  return document.entityType === "document" || document.entityType === "task";
}

function deriveNodeType(document: KiokuIndexDocument): KiokuGraphNode["type"] {
  if (document.entityType === "task") {
    return "task";
  }

  if (document.entityId.includes(":attachment:") || document.sourcePath.includes("#attachment:")) {
    return "attachment";
  }

  return "doc";
}

function tokenize(value: string): ReadonlyArray<string> {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function uniqueTokens(values: ReadonlyArray<string>): ReadonlySet<string> {
  return new Set(values.flatMap((value) => tokenize(value)));
}

function buildTokens(document: KiokuIndexDocument): ReadonlySet<string> {
  return uniqueTokens([
    document.entityId,
    document.workspaceId,
    document.projectId ?? "",
    document.boardId ?? "",
    document.taskId ?? "",
    document.codebaseName ?? "",
    document.title,
    document.summary,
    ...document.keywords,
    ...document.relations.map((relation) => `${relation.kind} ${relation.id}`),
  ]);
}

function similarity(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of left) {
    if (right.has(token)) {
      shared += 1;
    }
  }

  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

function roundScore(score: number): number {
  return Number(score.toFixed(3));
}

export function buildKiokuGraph(storage: Pick<KiokuStorage, "listEntityIds" | "fetchById">, options: GraphOptions = {}): KiokuGraphResponse {
  const threshold = options.threshold ?? 0.2;
  const records = storage
    .listEntityIds()
    .map((entityId) => storage.fetchById(entityId))
    .filter((document): document is NonNullable<ReturnType<KiokuStorage["fetchById"]>> => document !== null)
    .filter((document) => isDocumentEntity(document))
    .filter((document) => options.projectId === undefined || document.projectId === options.projectId)
    .map((document) => ({
      node: {
        id: document.entityId,
        label: document.title,
        type: deriveNodeType(document),
        projectId: document.projectId,
        updatedAt: document.updatedAt,
      },
      tokens: buildTokens(document),
    } satisfies GraphRecord));

  if (records.length === 0) {
    return { nodes: [], edges: [] };
  }

  const edges: KiokuGraphEdge[] = [];
  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const left = records[leftIndex]!;
      const right = records[rightIndex]!;
      const score = similarity(left.tokens, right.tokens);
      if (score < threshold) {
        continue;
      }

      edges.push({
        source: left.node.id,
        target: right.node.id,
        score: roundScore(score),
      });
    }
  }

  return {
    nodes: records.map((record) => record.node),
    edges,
  };
}
