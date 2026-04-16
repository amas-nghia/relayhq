export const REDACTED_VALUE = "[redacted]" as const;

const SECRET_VALUE_PATTERNS = [
  /\b(?:sk|pk|rk|xox[baprs])-[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._\-+/=]{16,}\b/g,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|secret|password)\b\s*[:=]\s*['"]?[^\s'"`]{8,}['"]?/gi,
] as const;

const SECRET_VALUE_CHECK_PATTERNS = [
  /\b(?:sk|pk|rk|xox[baprs])-[A-Za-z0-9_-]{12,}\b/,
  /\bBearer\s+[A-Za-z0-9._\-+/=]{16,}\b/,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?token|secret|password)\b\s*[:=]\s*['"]?[^\s'"`]{8,}['"]?/i,
] as const;

function redactString(value: string): string {
  let result = value;

  for (const pattern of SECRET_VALUE_PATTERNS) {
    result = result.replace(pattern, REDACTED_VALUE);
  }

  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function containsSecretMaterial(value: unknown): boolean {
  if (typeof value === "string") {
    return SECRET_VALUE_CHECK_PATTERNS.some((pattern) => pattern.test(value));
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSecretMaterial(item));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).some(([, nestedValue]) => containsSecretMaterial(nestedValue));
}

export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") {
    return redactString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [key, redactSecrets(nestedValue)]),
  ) as T;
}

export function redactSecretText(value: string): string {
  return redactString(value);
}
