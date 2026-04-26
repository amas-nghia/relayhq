import { randomUUID } from "node:crypto";

export interface RealtimeUpdate {
  readonly id: string;
  readonly kind: "vault.changed" | "ping";
  readonly reason: string | null;
  readonly timestamp: string;
  readonly taskId: string | null;
  readonly agentId: string | null;
  readonly source: string | null;
}

export type RealtimeSubscriber = (update: RealtimeUpdate) => void;

const subscribers = new Set<RealtimeSubscriber>();

export function publishRealtimeUpdate(update: Omit<RealtimeUpdate, "id" | "timestamp"> & { readonly timestamp?: string }): RealtimeUpdate {
  const event: RealtimeUpdate = {
    id: `realtime-${randomUUID().slice(0, 8)}`,
    kind: update.kind,
    reason: update.reason ?? null,
    timestamp: update.timestamp ?? new Date().toISOString(),
    taskId: update.taskId ?? null,
    agentId: update.agentId ?? null,
    source: update.source ?? null,
  };

  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch {
      // Keep other listeners alive even if one subscriber fails.
    }
  }

  return event;
}

export function subscribeRealtimeUpdates(subscriber: RealtimeSubscriber): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}
