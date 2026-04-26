import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface InstalledSkill {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly requires: ReadonlyArray<string>;
  readonly taskTypes: ReadonlyArray<string>;
  readonly appliesToTags: ReadonlyArray<string>;
  readonly content: string;
  readonly sourcePath: string;
}

export interface SkillMatchTask {
  readonly type: string;
  readonly tags: ReadonlyArray<string>;
}

export interface SkillMatchRequest {
  readonly skills: ReadonlyArray<InstalledSkill>;
  readonly task?: SkillMatchTask | null;
  readonly agentSkillFiles?: ReadonlyArray<string>;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeVersionPart(value: string): number {
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(normalizeVersionPart);
  const rightParts = right.split(".").map(normalizeVersionPart);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) return delta;
  }

  return 0;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseList(lines: ReadonlyArray<string>, startIndex: number): { readonly values: ReadonlyArray<string>; readonly nextIndex: number } {
  const values: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index]!.trim();
    if (!line.startsWith("- ")) break;
    values.push(stripQuotes(line.slice(2)));
    index += 1;
  }

  return { values, nextIndex: index };
}

function parseSkillFrontmatter(content: string): { readonly frontmatter: Record<string, string | ReadonlyArray<string>>; readonly body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const lines = match[1]!.split(/\r?\n/);
  const frontmatter: Record<string, string | ReadonlyArray<string>> = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    if (rawValue === "") {
      const list = parseList(lines.slice(index + 1), 0);
      frontmatter[key] = list.values;
      index += list.nextIndex;
      continue;
    }

    if (rawValue === "[]") {
      frontmatter[key] = [];
      continue;
    }

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
          frontmatter[key] = parsed.map((item) => String(item));
          continue;
        }
      } catch {
        // fall through to scalar parsing
      }
    }

    frontmatter[key] = stripQuotes(rawValue);
  }

  return { frontmatter, body: match[2] ?? "" };
}

function asString(value: string | ReadonlyArray<string> | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: string | ReadonlyArray<string> | undefined): ReadonlyArray<string> {
  return Array.isArray(value) ? value.map((entry) => entry.trim()).filter((entry) => entry.length > 0) : [];
}

function isSkillMatch(task: SkillMatchTask | null | undefined, skill: InstalledSkill): boolean {
  if (task === undefined || task === null) return false;
  const typeMatch = skill.taskTypes.includes(task.type);
  const tagMatch = skill.appliesToTags.some((tag) => task.tags.includes(tag));
  return typeMatch || tagMatch;
}

export function getRelayHQSkillDir(): string {
  return join(homedir(), ".relayhq", "skills");
}

export async function loadInstalledSkills(skillDir: string = getRelayHQSkillDir()): Promise<ReadonlyArray<InstalledSkill>> {
  try {
    const files = await readdir(skillDir);
    const loaded: InstalledSkill[] = [];

    for (const fileName of files.filter((file) => file.endsWith(".md"))) {
      const sourcePath = join(skillDir, fileName);
      try {
        const content = await readFile(sourcePath, "utf8");
        const parsed = parseSkillFrontmatter(content);
        if (parsed === null) continue;

        const name = asString(parsed.frontmatter.name);
        const version = asString(parsed.frontmatter.version);
        const description = asString(parsed.frontmatter.description);
        if (name === null || version === null || description === null) continue;

        loaded.push({
          name,
          version,
          description,
          requires: asStringArray(parsed.frontmatter.requires),
          taskTypes: asStringArray(parsed.frontmatter.task_types),
          appliesToTags: asStringArray(parsed.frontmatter.applies_to_tags),
          content: parsed.body.trim(),
          sourcePath,
        });
      } catch {
        continue;
      }
    }

    const latestByName = new Map<string, InstalledSkill>();
    for (const skill of loaded) {
      const normalizedName = normalizeName(skill.name);
      const existing = latestByName.get(normalizedName);
      if (existing === undefined || compareVersions(skill.version, existing.version) >= 0) {
        latestByName.set(normalizedName, skill);
      }
    }

    return [...latestByName.values()].sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return [];
  }
}

export function matchInstalledSkills(request: SkillMatchRequest): ReadonlyArray<InstalledSkill> {
  const task = request.task ?? null;
  const agentSkillFiles = new Set((request.agentSkillFiles ?? []).map((value) => normalizeName(value)));
  const matched = request.skills.filter((skill) => agentSkillFiles.has(normalizeName(skill.name)) || isSkillMatch(task, skill));
  const deduped = new Map<string, InstalledSkill>();

  for (const skill of matched) {
    deduped.set(normalizeName(skill.name), skill);
  }

  return [...deduped.values()].sort((left, right) => left.name.localeCompare(right.name));
}
