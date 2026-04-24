import { randomBytes } from "node:crypto";

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000;

export interface SessionStoreEntry {
  readonly agentName: string;
  readonly lastSeenAt: string;
  readonly etag: string;
}

export interface ActiveSession {
  readonly agentName: string;
  readonly lastSeenAt: string;
  readonly idleSeconds: number;
}

interface SessionStoreOptions {
  readonly ttlMs?: number;
  readonly tokenFactory?: () => string;
}

function createSessionToken(): string {
  return `sess-${randomBytes(4).toString("hex")}`;
}

export class SessionStore {
  readonly #entries = new Map<string, SessionStoreEntry>();
  readonly #ttlMs: number;
  readonly #tokenFactory: () => string;

  constructor(options: SessionStoreOptions = {}) {
    this.#ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
    this.#tokenFactory = options.tokenFactory ?? createSessionToken;
  }

  issue(agentName: string, now: Date = new Date()): string {
    this.cleanupExpired(now);

    let token = this.#tokenFactory();
    while (this.#entries.has(token)) {
      token = this.#tokenFactory();
    }

    this.#entries.set(token, {
      agentName,
      lastSeenAt: now.toISOString(),
      etag: "",
    });
    return token;
  }

  touch(token: string, now: Date = new Date()): SessionStoreEntry | null {
    this.cleanupExpired(now);

    const entry = this.#entries.get(token);
    if (entry === undefined) {
      return null;
    }

    const nextEntry = {
      ...entry,
      lastSeenAt: now.toISOString(),
    } satisfies SessionStoreEntry;
    this.#entries.set(token, nextEntry);
    return nextEntry;
  }

  get(token: string, now: Date = new Date()): SessionStoreEntry | null {
    this.cleanupExpired(now);
    return this.#entries.get(token) ?? null;
  }

  setEtag(token: string, etag: string): void {
    const entry = this.#entries.get(token);
    if (entry === undefined) {
      return;
    }

    this.#entries.set(token, {
      ...entry,
      etag,
    });
  }

  getActiveSessions(now: Date = new Date()): ReadonlyArray<ActiveSession> {
    this.cleanupExpired(now);

    const nowMs = now.getTime();
    const sessions = Array.from(this.#entries.values())
      .map((entry) => ({
        ...entry,
        idleSeconds: Math.max(0, Math.floor((nowMs - Date.parse(entry.lastSeenAt)) / 1000)),
      }))
      .sort((left, right) => left.agentName.localeCompare(right.agentName) || right.lastSeenAt.localeCompare(left.lastSeenAt));

    const counts = new Map<string, number>();
    for (const session of sessions) {
      counts.set(session.agentName, (counts.get(session.agentName) ?? 0) + 1);
    }

    const seen = new Map<string, number>();
    return sessions.map((session) => {
      const count = counts.get(session.agentName) ?? 0;
      const index = (seen.get(session.agentName) ?? 0) + 1;
      seen.set(session.agentName, index);

      return {
        agentName: count > 1 ? `${session.agentName}#${index}` : session.agentName,
        lastSeenAt: session.lastSeenAt,
        idleSeconds: session.idleSeconds,
      } satisfies ActiveSession;
    });
  }

  cleanupExpired(now: Date = new Date()): void {
    const nowMs = now.getTime();
    for (const [token, entry] of this.#entries.entries()) {
      const lastSeenMs = Date.parse(entry.lastSeenAt);
      if (!Number.isFinite(lastSeenMs) || lastSeenMs + this.#ttlMs <= nowMs) {
        this.#entries.delete(token);
      }
    }
  }
}

export const sessionStore = new SessionStore();
