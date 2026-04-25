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
      webhooks: [{ url: "https://example.com/hook", events: ["task.done", "task.blocked"] }],
    }, root);

    expect(saved.webhooks).toHaveLength(1);
    expect(saved.webhooks[0]?.events).toEqual(["task.done", "task.blocked"]);

    const loaded = await readWebhookSettings(root);
    expect(loaded).toEqual(saved);
  });

  test("retries once when webhook responds with a 5xx", async () => {
    const fetchImpl = mock(async () => {
      const count = fetchImpl.mock.calls.length;
      return new Response(null, { status: count === 1 ? 500 : 200 });
    }) as unknown as typeof fetch;

    await sendWebhookTest("https://example.com/hook", {
      event: "task.done",
      taskId: "task-001",
      title: "Demo",
      status: "done",
      assignee: "claude-code",
      timestamp: new Date().toISOString(),
      boardUrl: "http://127.0.0.1:44211/boards/board-demo",
    }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
