import { Dirent, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, sep } from "node:path";

import { buildCodeDocumentUpdate, buildDocumentUpdate, type KiokuWorkStateUpdate } from "./indexer";

const INCLUDED_EXTENSIONS = new Set([".ts", ".vue", ".md"]);
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".nuxt", ".output", ".git", "dist"]);
const MAX_SUMMARY_LENGTH = 200;
const DEFAULT_DOCUMENT_TITLE = "Untitled document";
const EXPORTED_NAME_PATTERN = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const)\s+([A-Za-z_$][\w$]*)/g;
const DEFAULT_EXPORT_PATTERN = /export\s+default\b/g;

function toPortablePath(value: string): string {
  return value.split(sep).join("/");
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function extractExports(source: string): ReadonlyArray<string> {
  const exported = new Set<string>();

  for (const match of source.matchAll(EXPORTED_NAME_PATTERN)) {
    const name = match[1]?.trim();
    if (name) {
      exported.add(name);
    }
  }

  if (DEFAULT_EXPORT_PATTERN.test(source)) {
    exported.add("default");
  }

  return [...exported];
}

function firstMarkdownHeading(source: string): string | null {
  const match = source.match(/^#\s+(.+)$/m);
  return match ? normalizeWhitespace(match[1] ?? "") : null;
}

function firstMarkdownParagraph(source: string): string | null {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim());

  const paragraphLines: string[] = [];
  let started = false;

  for (const line of lines) {
    if (!started) {
      if (!line || line.startsWith("#") || line.startsWith("```") || line.startsWith("-") || line.startsWith("*") || /^\d+\.\s/.test(line)) {
        continue;
      }
      started = true;
    }

    if (!line) {
      if (paragraphLines.length > 0) {
        break;
      }
      continue;
    }

    if (line.startsWith("#") || line.startsWith("```") || line.startsWith("-") || line.startsWith("*") || /^\d+\.\s/.test(line)) {
      if (paragraphLines.length > 0) {
        break;
      }
      continue;
    }

    paragraphLines.push(line);
  }

  if (paragraphLines.length === 0) {
    return null;
  }

  return normalizeWhitespace(paragraphLines.join(" "));
}

function deriveTags(relativePath: string): ReadonlyArray<string> {
  return relativePath
    .split("/")
    .slice(0, -1)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function shouldSkipEntry(entry: Dirent, parentPath: string): boolean {
  if (entry.isDirectory()) {
    return SKIPPED_DIRECTORIES.has(entry.name);
  }

  if (!entry.isFile()) {
    return true;
  }

  const extension = extname(entry.name);
  if (!INCLUDED_EXTENSIONS.has(extension)) {
    return true;
  }

  if (extension === ".ts" && (entry.name.endsWith(".test.ts") || entry.name.endsWith(".spec.ts"))) {
    return true;
  }

  return parentPath.split("/").some((segment) => SKIPPED_DIRECTORIES.has(segment));
}

export interface IndexCodebaseOptions {
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly codebaseName?: string;
}

function buildCodebaseDocument(
  relativePath: string,
  title: string,
  content: string,
  updatedAt: string,
  options: IndexCodebaseOptions,
): KiokuWorkStateUpdate {
  if (options.projectId === undefined || options.workspaceId === undefined) {
    return buildDocumentUpdate({
      id: relativePath,
      title,
      content,
      sourcePath: relativePath,
      tags: deriveTags(relativePath),
      updatedAt,
    });
  }

  return buildCodeDocumentUpdate({
    id: `${options.projectId}:${options.codebaseName ?? "main"}:${relativePath}`,
    title,
    content,
    sourcePath: relativePath,
    tags: deriveTags(relativePath),
    updatedAt,
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    codebaseName: options.codebaseName,
  });
}

function buildTypeScriptUpdate(rootPath: string, filePath: string, relativePath: string, options: IndexCodebaseOptions): KiokuWorkStateUpdate {
  const source = readFileSync(filePath, "utf8");
  const exportedNames = extractExports(source);
  const fileName = basename(relativePath);
  const summary = truncate(
    `${fileName} - exports: ${exportedNames.length > 0 ? exportedNames.join(", ") : "none"}`,
    MAX_SUMMARY_LENGTH,
  );

  return buildCodebaseDocument(relativePath, fileName, summary, statSync(filePath).mtime.toISOString(), options);
}

function buildVueUpdate(filePath: string, relativePath: string, options: IndexCodebaseOptions): KiokuWorkStateUpdate {
  const componentName = basename(relativePath, extname(relativePath));
  const summary = truncate(`${basename(relativePath)} - component: ${componentName}`, MAX_SUMMARY_LENGTH);

  return buildCodebaseDocument(relativePath, componentName, summary, statSync(filePath).mtime.toISOString(), options);
}

function buildMarkdownUpdate(filePath: string, relativePath: string, options: IndexCodebaseOptions): KiokuWorkStateUpdate {
  const source = readFileSync(filePath, "utf8");
  const title = firstMarkdownHeading(source) ?? basename(relativePath, extname(relativePath)) ?? DEFAULT_DOCUMENT_TITLE;
  const paragraph = firstMarkdownParagraph(source) ?? `${basename(relativePath)} documentation`;

  return buildCodebaseDocument(relativePath, title, truncate(paragraph, MAX_SUMMARY_LENGTH), statSync(filePath).mtime.toISOString(), options);
}

function buildUpdateForFile(rootPath: string, filePath: string, options: IndexCodebaseOptions): KiokuWorkStateUpdate {
  const relativePath = toPortablePath(relative(rootPath, filePath));
  const extension = extname(filePath);

  if (extension === ".ts") {
    return buildTypeScriptUpdate(rootPath, filePath, relativePath, options);
  }

  if (extension === ".vue") {
    return buildVueUpdate(filePath, relativePath, options);
  }

  return buildMarkdownUpdate(filePath, relativePath, options);
}

function collectUpdates(rootPath: string, currentPath: string, updates: KiokuWorkStateUpdate[], options: IndexCodebaseOptions): void {
  const relativeCurrentPath = currentPath === rootPath ? "" : toPortablePath(relative(rootPath, currentPath));
  const entries = readdirSync(currentPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (shouldSkipEntry(entry, relativeCurrentPath)) {
      continue;
    }

    const nextPath = join(currentPath, entry.name);
    if (entry.isDirectory()) {
      collectUpdates(rootPath, nextPath, updates, options);
      continue;
    }

    updates.push(buildUpdateForFile(rootPath, nextPath, options));
  }
}

export function indexCodebaseFiles(rootPath: string, options: IndexCodebaseOptions = {}): ReadonlyArray<KiokuWorkStateUpdate> {
  const updates: KiokuWorkStateUpdate[] = [];
  collectUpdates(rootPath, rootPath, updates, options);
  return updates;
}
