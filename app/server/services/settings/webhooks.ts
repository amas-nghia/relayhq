import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../vault/runtime";

export const WEBHOOK_EVENTS = [
  "task.claimed",
  "task.done",
  "task.blocked",
  "task.waiting-approval",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookConfig {
  readonly id: string;
  readonly url: string;
  readonly events: ReadonlyArray<WebhookEvent>;
}

export interface WebhookSettings {
  readonly webhooks: ReadonlyArray<WebhookConfig>;
}

export interface WebhookPayload {
  readonly event: WebhookEvent;
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly assignee: string | null;
  readonly timestamp: string;
  readonly boardUrl: string;
}

function resolveSettingsFilePath(vaultRoot: string): string {
  return join(resolveSharedVaultPath(vaultRoot), "settings", "webhooks.json");
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOENT";
}

function normalizeUrl(url: string): string {
  const normalized = url.trim();
  const parsed = new URL(normalized);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use http or https.");
  }
  return parsed.toString();
}

function normalizeEvents(events: ReadonlyArray<string>): ReadonlyArray<WebhookEvent> {
  const unique = [...new Set(events.map((event) => event.trim()).filter(Boolean))];
  for (const event of unique) {
    if (!WEBHOOK_EVENTS.includes(event as WebhookEvent)) {
      throw new Error(`Unsupported webhook event: ${event}.`);
    }
  }
  return unique as ReadonlyArray<WebhookEvent>;
}

export async function readWebhookSettings(vaultRoot: string = resolveVaultWorkspaceRoot()): Promise<WebhookSettings> {
  const filePath = resolveSettingsFilePath(vaultRoot);
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as { webhooks?: ReadonlyArray<{ id?: string; url?: string; events?: ReadonlyArray<string> }> };
    return {
      webhooks: (parsed.webhooks ?? []).flatMap((webhook) => {
        if (typeof webhook.id !== "string" || typeof webhook.url !== "string" || !Array.isArray(webhook.events)) {
          return [];
        }
        return [{ id: webhook.id, url: webhook.url, events: normalizeEvents(webhook.events) } satisfies WebhookConfig];
      }),
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return { webhooks: [] };
    }
    throw error;
  }
}

export async function saveWebhookSettings(
  input: { readonly webhooks: ReadonlyArray<{ id?: string; url: string; events: ReadonlyArray<string> }> },
  vaultRoot: string = resolveVaultWorkspaceRoot(),
): Promise<WebhookSettings> {
  const next: WebhookSettings = {
    webhooks: input.webhooks.map((webhook, index) => ({
      id: webhook.id?.trim() || `webhook-${index + 1}`,
      url: normalizeUrl(webhook.url),
      events: normalizeEvents(webhook.events),
    })),
  };

  const filePath = resolveSettingsFilePath(vaultRoot);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

async function postWebhook(url: string, payload: WebhookPayload, fetchImpl: typeof fetch): Promise<Response> {
  return await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function deliverWebhook(url: string, payload: WebhookPayload, fetchImpl: typeof fetch): Promise<void> {
  const first = await postWebhook(url, payload, fetchImpl).catch(() => null);
  if (first !== null && first.status < 500) {
    return;
  }
  await postWebhook(url, payload, fetchImpl).catch(() => undefined);
}

export async function sendWebhookTest(
  url: string,
  payload: WebhookPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await deliverWebhook(normalizeUrl(url), payload, fetchImpl);
}

export function queueTaskWebhookNotification(
  payload: WebhookPayload,
  options: { readonly vaultRoot?: string; readonly fetchImpl?: typeof fetch } = {},
): void {
  queueMicrotask(() => {
    void (async () => {
      const settings = await readWebhookSettings(options.vaultRoot);
      const fetchImpl = options.fetchImpl ?? fetch;
      const matching = settings.webhooks.filter((webhook) => webhook.events.includes(payload.event));
      await Promise.all(matching.map((webhook) => deliverWebhook(webhook.url, payload, fetchImpl)));
    })().catch(() => undefined);
  });
}
