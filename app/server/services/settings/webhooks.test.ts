import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readWebhookSettings, saveWebhookSettings, sendWebhookTest } from "./webhooks";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("webhook settings", () => {
  test("saves and reloads webhook config", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-webhooks-"));
    roots.push(root);

    const saved = await saveWebhookSettings({
      webhooks: [{ url: "https://93.184.216.34/hook", events: ["task.done", "task.blocked"], signingSecretRef: "env:RELAYHQ_WEBHOOK_SECRET" }],
    }, root);

    expect(saved.webhooks).toHaveLength(1);
    expect(saved.webhooks[0]?.events).toEqual(["task.done", "task.blocked"]);
    expect(saved.webhooks[0]?.signingSecretRef).toBe("env:RELAYHQ_WEBHOOK_SECRET");
    expect(saved.deliveries).toEqual([]);

    const loaded = await readWebhookSettings(root);
    expect(loaded).toEqual(saved);
  });

  test("retries with backoff when webhook responds with retryable statuses", async () => {
    const fetchImpl = mock(async () => {
      const count = fetchImpl.mock.calls.length;
      return new Response(null, { status: count < 3 ? 500 : 200 });
    }) as unknown as typeof fetch;
    const sleep = mock(async () => undefined) as (durationMs: number) => Promise<void>;

    const delivery = await sendWebhookTest({
      id: "webhook-1",
      url: "https://93.184.216.34/hook",
      signingSecretRef: null,
    }, {
      event: "task.done",
      taskId: "task-001",
      title: "Demo",
      status: "done",
      assignee: "claude-code",
      timestamp: new Date().toISOString(),
      boardUrl: "http://127.0.0.1:44211/boards/board-demo",
    }, { fetchImpl, sleep });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(delivery.status).toBe("success");
    expect(delivery.attemptCount).toBe(3);
  });

  test("records failed deliveries after the expanded retry policy", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-webhooks-"));
    roots.push(root);
    const fetchImpl = mock(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const sleep = mock(async () => undefined) as (durationMs: number) => Promise<void>;

    await expect(sendWebhookTest({
      id: "webhook-1",
      url: "https://93.184.216.34/hook",
      signingSecretRef: null,
    }, {
      event: "task.done",
      taskId: "task-001",
      title: "Demo",
      status: "done",
      assignee: "claude-code",
      timestamp: new Date().toISOString(),
      boardUrl: "http://127.0.0.1:44211/boards/board-demo",
    }, { fetchImpl, sleep, vaultRoot: root })).rejects.toThrow("network down");

    const loaded = await readWebhookSettings(root);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(loaded.deliveries[0]?.attemptCount).toBe(4);
    expect(loaded.deliveries[0]?.status).toBe("failed");
  });

  test("signs webhook requests and stores successful test deliveries", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-webhooks-"));
    roots.push(root);
    process.env.RELAYHQ_WEBHOOK_SECRET = "top-secret";

    try {
      const fetchImpl = mock(async (_url: string, init?: RequestInit) => {
        expect(init?.headers).toMatchObject({
          "content-type": "application/json",
          "x-relayhq-event": "task.done",
        });
        const headers = init?.headers as Record<string, string>;
        expect(headers["x-relayhq-signature"]).toMatch(/^sha256=/);
        expect(String(init?.body)).toContain('"text":"[RelayHQ] task.done • Demo"');
        return new Response(null, { status: 202 });
      }) as unknown as typeof fetch;

      const delivery = await sendWebhookTest({
        id: "webhook-1",
        url: "https://hooks.slack.com/services/T000/B000/secret",
        signingSecretRef: "env:RELAYHQ_WEBHOOK_SECRET",
      }, {
        event: "task.done",
        taskId: "task-001",
        title: "Demo",
        status: "done",
        assignee: "claude-code",
        timestamp: new Date().toISOString(),
        boardUrl: "http://127.0.0.1:44211/boards/board-demo",
      }, { fetchImpl, vaultRoot: root });

      const loaded = await readWebhookSettings(root);
      expect(delivery.status).toBe("success");
      expect(loaded.deliveries).toHaveLength(1);
      expect(loaded.deliveries[0]?.webhookId).toBe("webhook-1");
      expect(loaded.deliveries[0]?.status).toBe("success");
    } finally {
      delete process.env.RELAYHQ_WEBHOOK_SECRET;
    }
  });

  test("rejects localhost webhook urls", async () => {
    const root = await mkdtemp(join(tmpdir(), "relayhq-webhooks-"));
    roots.push(root);
    await expect(saveWebhookSettings({
      webhooks: [{ url: "http://127.0.0.1:3000/webhook", events: ["task.done"] }],
    }, root)).rejects.toThrow("private network");
  });
});
