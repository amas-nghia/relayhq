import { createHmac, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, join } from "node:path";

import { resolveSharedVaultPath, resolveVaultWorkspaceRoot } from "../vault/runtime";

export const WEBHOOK_EVENTS = [
  "task.created",
  "task.claimed",
  "task.review",
  "task.done",
  "task.blocked",
  "task.waiting-approval",
  "task.scheduled",
  "task.updated",
  "task.approved",
  "task.rejected",
] as const;

const WEBHOOK_RETRY_DELAYS_MS = [0, 500, 1_500, 5_000] as const;
const WEBHOOK_TIMEOUT_MS = 5_000;
const MAX_WEBHOOK_DELIVERIES = 50;
const SIGNING_SECRET_REF_PATTERN = /^env:[A-Z][A-Z0-9_]*$/;
let deliveryWriteQueue: Promise<void> = Promise.resolve();

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookConfig {
  readonly id: string;
  readonly url: string;
  readonly events: ReadonlyArray<WebhookEvent>;
  readonly signingSecretRef: string | null;
}

export interface WebhookDeliveryRecord {
  readonly id: string;
  readonly webhookId: string;
  readonly event: WebhookEvent;
  readonly status: "success" | "failed";
  readonly responseStatus: number | null;
  readonly error: string | null;
  readonly attemptCount: number;
  readonly deliveredAt: string;
}

export interface WebhookSettings {
  readonly webhooks: ReadonlyArray<WebhookConfig>;
  readonly deliveries: ReadonlyArray<WebhookDeliveryRecord>;
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

async function normalizeUrl(url: string, validateNetwork: boolean = true): Promise<string> {
  const normalized = url.trim();
  const parsed = new URL(normalized);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use http or https.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Webhook URL must not include inline credentials.");
  }
  if (validateNetwork && await isDisallowedWebhookHost(parsed.hostname)) {
    throw new Error("Webhook URL must not target localhost or a private network address.");
  }
  return parsed.toString();
}

function isPrivateIpAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  if (normalized.length === 0) return true;

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const [first = 0, second = 0] = normalized.split(".").map((segment) => Number.parseInt(segment, 10));
    return first === 0
      || first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }

  if (ipVersion === 6) {
    if (normalized.startsWith("::ffff:")) {
      return isPrivateIpAddress(normalized.slice("::ffff:".length));
    }

    return normalized === "::1"
      || normalized === "::"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe80:");
  }

  return false;
}

function isKnownLocalHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized.length === 0 || normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local");
}

async function isDisallowedWebhookHost(hostname: string): Promise<boolean> {
  const normalized = hostname.trim().toLowerCase();
  if (isPrivateIpAddress(normalized) || isKnownLocalHost(normalized)) {
    return true;
  }

  if (isIP(normalized) !== 0) {
    return false;
  }

  try {
    const addresses = await lookup(normalized, { all: true });
    return addresses.some((entry) => isPrivateIpAddress(entry.address));
  } catch {
    return true;
  }
}

function normalizeEvents(events: ReadonlyArray<string>): ReadonlyArray<WebhookEvent> {
  const unique = [...new Set(events.map((event) => event.trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw new Error("Webhook events must include at least one event.");
  }
  for (const event of unique) {
    if (!WEBHOOK_EVENTS.includes(event as WebhookEvent)) {
      throw new Error(`Unsupported webhook event: ${event}.`);
    }
  }
  return unique as ReadonlyArray<WebhookEvent>;
}

function normalizeSigningSecretRef(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  if (!SIGNING_SECRET_REF_PATTERN.test(normalized)) {
    throw new Error("Webhook signing secret ref must use env:NAME format.");
  }

  return normalized;
}

async function parseWebhookConfig(
  webhook: { id?: string; url?: string; events?: ReadonlyArray<string>; signing_secret_ref?: string | null; signingSecretRef?: string | null },
  index: number,
  validateNetwork: boolean = true,
): WebhookConfig {
  if (typeof webhook.url !== "string" || !Array.isArray(webhook.events)) {
    throw new Error("Invalid webhook config.");
  }

  return {
    id: typeof webhook.id === "string" && webhook.id.trim().length > 0 ? webhook.id.trim() : `webhook-${index + 1}`,
    url: await normalizeUrl(webhook.url, validateNetwork),
    events: normalizeEvents(webhook.events),
    signingSecretRef: normalizeSigningSecretRef(webhook.signing_secret_ref ?? webhook.signingSecretRef),
  };
}

function parseWebhookDeliveryRecord(
  record: { id?: string; webhookId?: string; event?: string; status?: string; responseStatus?: unknown; error?: unknown; attemptCount?: unknown; deliveredAt?: unknown },
): WebhookDeliveryRecord {
  if (
    typeof record.id !== "string"
    || typeof record.webhookId !== "string"
    || typeof record.event !== "string"
    || !WEBHOOK_EVENTS.includes(record.event as WebhookEvent)
    || (record.status !== "success" && record.status !== "failed")
    || (record.responseStatus !== null && record.responseStatus !== undefined && typeof record.responseStatus !== "number")
    || (record.error !== null && record.error !== undefined && typeof record.error !== "string")
    || typeof record.attemptCount !== "number"
    || typeof record.deliveredAt !== "string"
  ) {
    throw new Error("Invalid webhook delivery record.");
  }

  return {
    id: record.id,
    webhookId: record.webhookId,
    event: record.event as WebhookEvent,
    status: record.status,
    responseStatus: record.responseStatus ?? null,
    error: record.error ?? null,
    attemptCount: record.attemptCount,
    deliveredAt: record.deliveredAt,
  };
}

async function readStoredWebhookSettings(vaultRoot: string): Promise<WebhookSettings> {
  const filePath = resolveSettingsFilePath(vaultRoot);
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as {
      webhooks?: ReadonlyArray<{ id?: string; url?: string; events?: ReadonlyArray<string>; signing_secret_ref?: string | null; signingSecretRef?: string | null }>;
      deliveries?: ReadonlyArray<{ id?: string; webhookId?: string; event?: string; status?: string; responseStatus?: unknown; error?: unknown; attemptCount?: unknown; deliveredAt?: unknown }>;
    };

    return {
      webhooks: (await Promise.all((parsed.webhooks ?? []).map(async (webhook, index) => {
        try {
          return await parseWebhookConfig(webhook, index, false);
        } catch {
          return null;
        }
      }))).filter((webhook): webhook is WebhookConfig => webhook !== null),
      deliveries: (parsed.deliveries ?? []).flatMap((record) => {
        try {
          return [parseWebhookDeliveryRecord(record)];
        } catch {
          return [];
        }
      }).sort((left, right) => right.deliveredAt.localeCompare(left.deliveredAt)),
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return { webhooks: [], deliveries: [] };
    }
    throw error;
  }
}

async function writeWebhookSettings(settings: WebhookSettings, vaultRoot: string): Promise<void> {
  const filePath = resolveSettingsFilePath(vaultRoot);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({
    webhooks: settings.webhooks.map((webhook) => ({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      signing_secret_ref: webhook.signingSecretRef,
    })),
    deliveries: settings.deliveries,
  }, null, 2)}\n`, "utf8");
}

export async function readWebhookSettings(vaultRoot: string = resolveVaultWorkspaceRoot()): Promise<WebhookSettings> {
  return await readStoredWebhookSettings(vaultRoot);
}

export async function saveWebhookSettings(
  input: { readonly webhooks: ReadonlyArray<{ id?: string; url: string; events: ReadonlyArray<string>; signingSecretRef?: string | null }> },
  vaultRoot: string = resolveVaultWorkspaceRoot(),
): Promise<WebhookSettings> {
  const current = await readStoredWebhookSettings(vaultRoot);
  const next: WebhookSettings = {
    webhooks: await Promise.all(input.webhooks.map(async (webhook, index) => await parseWebhookConfig(webhook, index))),
    deliveries: current.deliveries,
  };

  await writeWebhookSettings(next, vaultRoot);
  return next;
}

function resolveSigningSecret(signingSecretRef: string | null): string | null {
  if (signingSecretRef === null) {
    return null;
  }

  const envName = signingSecretRef.slice("env:".length);
  const secret = process.env[envName];
  if (typeof secret !== "string" || secret.trim().length === 0) {
    throw new Error(`Webhook signing secret environment variable ${envName} is not set.`);
  }

  return secret;
}

function createSignature(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

function createAbortSignal(timeoutMs: number): { readonly signal: AbortSignal; readonly clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

function isSlackWebhookUrl(url: string): boolean {
  const hostname = new URL(url).hostname.toLowerCase();
  return hostname === "hooks.slack.com" || hostname === "hooks.slack-gov.com";
}

function buildWebhookBody(webhook: WebhookConfig, payload: WebhookPayload): string {
  if (!isSlackWebhookUrl(webhook.url)) {
    return JSON.stringify(payload);
  }

  return JSON.stringify({
    text: `[RelayHQ] ${payload.event} • ${payload.title}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*RelayHQ* • \`${payload.event}\`\n*Task:* ${payload.title}\n*Status:* ${payload.status}${payload.assignee ? `\n*Assignee:* ${payload.assignee}` : ""}`,
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `Task ID: ${payload.taskId}` },
          { type: "mrkdwn", text: `<${payload.boardUrl}|Open board>` },
        ],
      },
    ],
  });
}

async function postWebhook(
  webhook: WebhookConfig,
  payload: WebhookPayload,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  deliveryId: string,
): Promise<Response> {
  const body = buildWebhookBody(webhook, payload);
  const timestamp = new Date().toISOString();
  const signatureSecret = resolveSigningSecret(webhook.signingSecretRef);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "RelayHQ-Webhooks/1.0",
    "x-relayhq-delivery": deliveryId,
    "x-relayhq-event": payload.event,
    "x-relayhq-timestamp": timestamp,
  };

  if (signatureSecret !== null) {
    headers["x-relayhq-signature"] = createSignature(signatureSecret, timestamp, body);
  }

  const { signal, clear } = createAbortSignal(timeoutMs);
  try {
    return await fetchImpl(webhook.url, {
      method: "POST",
      headers,
      body,
      signal,
    });
  } finally {
    clear();
  }
}

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function formatWebhookError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Webhook delivery failed.";
}

async function appendWebhookDelivery(record: WebhookDeliveryRecord, vaultRoot: string): Promise<void> {
  deliveryWriteQueue = deliveryWriteQueue.catch(() => undefined).then(async () => {
    const current = await readStoredWebhookSettings(vaultRoot);
    const next: WebhookSettings = {
      webhooks: current.webhooks,
      deliveries: [record, ...current.deliveries].slice(0, MAX_WEBHOOK_DELIVERIES),
    };
    await writeWebhookSettings(next, vaultRoot);
  });

  await deliveryWriteQueue;
}

async function deliverWebhook(
  webhook: WebhookConfig,
  payload: WebhookPayload,
  options: { readonly fetchImpl?: typeof fetch; readonly sleep?: (durationMs: number) => Promise<void>; readonly timeoutMs?: number } = {},
): Promise<WebhookDeliveryRecord> {
  const validatedWebhook: WebhookConfig = {
    ...webhook,
    url: await normalizeUrl(webhook.url),
  };
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? (async (durationMs: number) => {
    await new Promise((resolve) => setTimeout(resolve, durationMs));
  });
  const timeoutMs = options.timeoutMs ?? WEBHOOK_TIMEOUT_MS;
  const deliveryId = randomUUID();

  let lastResponseStatus: number | null = null;
  let lastError: string | null = null;
  let attemptsMade = 0;

  for (const [attemptIndex, delayMs] of WEBHOOK_RETRY_DELAYS_MS.entries()) {
    attemptsMade = attemptIndex + 1;
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      const response = await postWebhook(validatedWebhook, payload, fetchImpl, timeoutMs, deliveryId);
      lastResponseStatus = response.status;

      if (response.status >= 200 && response.status < 300) {
        return {
          id: deliveryId,
          webhookId: validatedWebhook.id,
          event: payload.event,
          status: "success",
          responseStatus: response.status,
          error: null,
          attemptCount: attemptIndex + 1,
          deliveredAt: new Date().toISOString(),
        };
      }

      lastError = `Webhook responded with status ${response.status}.`;
      if (!shouldRetryStatus(response.status)) {
        break;
      }
    } catch (error) {
      lastError = formatWebhookError(error);
    }
  }

  return {
    id: deliveryId,
    webhookId: validatedWebhook.id,
    event: payload.event,
    status: "failed",
    responseStatus: lastResponseStatus,
    error: lastError,
    attemptCount: attemptsMade,
    deliveredAt: new Date().toISOString(),
  };
}

export async function sendWebhookTest(
  webhook: Pick<WebhookConfig, "id" | "url" | "signingSecretRef">,
  payload: WebhookPayload,
  options: { readonly fetchImpl?: typeof fetch; readonly vaultRoot?: string; readonly sleep?: (durationMs: number) => Promise<void>; readonly timeoutMs?: number } = {},
): Promise<WebhookDeliveryRecord> {
  const normalizedWebhook: WebhookConfig = {
    id: webhook.id?.trim() || "webhook-test",
    url: await normalizeUrl(webhook.url),
    events: normalizeEvents([payload.event]),
    signingSecretRef: normalizeSigningSecretRef(webhook.signingSecretRef),
  };

  const delivery = await deliverWebhook(normalizedWebhook, payload, options);
  if (options.vaultRoot) {
    await appendWebhookDelivery(delivery, options.vaultRoot);
  }
  if (delivery.status === "failed") {
    throw new Error(delivery.error ?? "Webhook delivery failed.");
  }
  return delivery;
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
      const vaultRoot = options.vaultRoot ?? resolveVaultWorkspaceRoot();
      await Promise.all(matching.map(async (webhook) => {
        const delivery = await deliverWebhook(webhook, payload, { fetchImpl });
        await appendWebhookDelivery(delivery, vaultRoot);
      }));
    })().catch(() => undefined);
  });
}
