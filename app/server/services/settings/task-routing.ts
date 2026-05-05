import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface TaskRoutingConfig {
  readonly tagAliases: Readonly<Record<string, ReadonlyArray<string>>>;
}

export const DEFAULT_TASK_ROUTING_CONFIG: TaskRoutingConfig = {
  tagAliases: {
    backend: ["feature-implementation", "bug-fix", "write-code"],
    tests: ["test-writing", "run-tests"],
    docs: ["documentation", "tech-writing"],
    analytics: ["backend", "data"],
    verification: ["run-tests", "test-writing"],
    release: ["verification", "run-tests"],
  },
};

function resolveTaskRoutingConfigPath(vaultRoot: string): string {
  return join(vaultRoot, "vault", "shared", "settings", "task-routing.json");
}

function normalizeAliasMap(input: unknown): TaskRoutingConfig["tagAliases"] {
  if (typeof input !== "object" || input === null) return DEFAULT_TASK_ROUTING_CONFIG.tagAliases;
  const entries = Object.entries(input as Record<string, unknown>)
    .map(([key, value]) => {
      const normalizedKey = key.trim().toLowerCase();
      if (!normalizedKey) return null;
      const normalizedValues = Array.isArray(value)
        ? [...new Set(value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim().toLowerCase()).filter(Boolean))]
        : [];
      return [normalizedKey, normalizedValues] as const;
    })
    .filter((entry): entry is readonly [string, ReadonlyArray<string>] => entry !== null);
  return Object.fromEntries(entries);
}

export async function readTaskRoutingConfig(vaultRoot: string): Promise<TaskRoutingConfig> {
  const filePath = resolveTaskRoutingConfigPath(vaultRoot);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { tagAliases?: unknown };
    return {
      tagAliases: {
        ...DEFAULT_TASK_ROUTING_CONFIG.tagAliases,
        ...normalizeAliasMap(parsed.tagAliases),
      },
    };
  } catch {
    return DEFAULT_TASK_ROUTING_CONFIG;
  }
}

export async function saveTaskRoutingConfig(vaultRoot: string, config: TaskRoutingConfig): Promise<TaskRoutingConfig> {
  const filePath = resolveTaskRoutingConfigPath(vaultRoot);
  const normalized: TaskRoutingConfig = {
    tagAliases: normalizeAliasMap(config.tagAliases),
  };
  await mkdir(join(vaultRoot, "vault", "shared", "settings"), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function expandRoutingTags(tags: ReadonlyArray<string>, config: TaskRoutingConfig): ReadonlySet<string> {
  const expanded = new Set<string>();
  const stack = tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (expanded.has(next)) continue;
    expanded.add(next);
    for (const alias of config.tagAliases[next] ?? []) {
      if (!expanded.has(alias)) stack.push(alias);
    }
  }
  return expanded;
}
