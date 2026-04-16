import type { ProviderOverlayFrontmatter } from "../../../shared/vault/schema";
import { isPrivateProviderOverlayPath } from "../authz/access";

export class ProviderOverlayRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderOverlayRuleError";
  }
}

export interface ProviderOverlayWritePlan {
  readonly path: string;
  readonly frontmatter: ProviderOverlayFrontmatter;
}

const FORBIDDEN_SECRET_KEYS = ["api_key", "apiKey", "token", "secret", "password"] as const;

const PRIVATE_PROVIDER_OVERLAY_PATH = /^vault\/users\/[^/]+\/provider\.md$/;

function hasForbiddenSecretKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenSecretKey);
  }

  if (value === null || typeof value !== "object") {
    return false;
  }

  return Object.entries(value).some(([key, nested]) => {
    if (FORBIDDEN_SECRET_KEYS.includes(key as (typeof FORBIDDEN_SECRET_KEYS)[number])) {
      return true;
    }

    return hasForbiddenSecretKey(nested);
  });
}

export function assertPrivateOverlayPath(path: string): void {
  if (!PRIVATE_PROVIDER_OVERLAY_PATH.test(path) || !isPrivateProviderOverlayPath(path)) {
    throw new ProviderOverlayRuleError("provider overlays must stay in private user vault files");
  }
}

export function assertSharedVaultSafeProviderOverlay(input: Record<string, unknown>): void {
  if (hasForbiddenSecretKey(input)) {
    throw new ProviderOverlayRuleError("provider overlays must not contain raw secrets");
  }
}

export function createProviderOverlayWritePlan(
  userId: string,
  path: string,
  frontmatter: ProviderOverlayFrontmatter,
): ProviderOverlayWritePlan {
  if (frontmatter.user_id !== userId) {
    throw new ProviderOverlayRuleError("provider overlay user does not match the active user");
  }

  const expectedPath = `vault/users/${userId.replace(/^@/, "")}/provider.md`;
  if (path !== expectedPath) {
    throw new ProviderOverlayRuleError("provider overlay path does not match the active user");
  }

  assertPrivateOverlayPath(path);
  assertSharedVaultSafeProviderOverlay(frontmatter as Record<string, unknown>);

  return {
    path,
    frontmatter,
  };
}
