import { describe, expect, test } from "bun:test";

import { parseWebhookSettingsBody } from "./webhooks.post";
import { parseWebhookTestRequest } from "./webhooks/test.post";

describe("settings webhook endpoints", () => {
  test("parses webhook settings payloads with optional fields", () => {
    expect(parseWebhookSettingsBody({
      webhooks: [
        {
          id: "webhook-1",
          url: "https://hooks.example.com/relayhq",
          events: ["task.done", "task.blocked"],
          signingSecretRef: "env:RELAYHQ_WEBHOOK_SECRET",
        },
        {
          url: "https://hooks.example.com/minimal",
          events: ["task.created"],
        },
      ],
    })).toEqual({
      webhooks: [
        {
          id: "webhook-1",
          url: "https://hooks.example.com/relayhq",
          events: ["task.done", "task.blocked"],
          signingSecretRef: "env:RELAYHQ_WEBHOOK_SECRET",
        },
        {
          id: undefined,
          url: "https://hooks.example.com/minimal",
          events: ["task.created"],
          signingSecretRef: null,
        },
      ],
    });
  });

  test("rejects malformed webhook settings payloads", () => {
    expect(() => parseWebhookSettingsBody({})).toThrow("webhooks must be provided as an array.");
    expect(() => parseWebhookSettingsBody({
      webhooks: [{ url: "https://hooks.example.com/demo", events: ["task.done", 123] }],
    })).toThrow("webhook 1 contains an invalid event value.");
  });

  test("parses webhook test payloads and defaults the event", () => {
    expect(parseWebhookTestRequest({ url: "https://hooks.example.com/demo" })).toEqual({
      url: "https://hooks.example.com/demo",
      event: "task.done",
      signingSecretRef: null,
    });

    expect(parseWebhookTestRequest({
      url: "https://hooks.example.com/demo",
      event: "task.blocked",
      signingSecretRef: "env:RELAYHQ_WEBHOOK_SECRET",
    })).toEqual({
      url: "https://hooks.example.com/demo",
      event: "task.blocked",
      signingSecretRef: "env:RELAYHQ_WEBHOOK_SECRET",
    });
  });

  test("rejects unsupported webhook test events", () => {
    expect(() => parseWebhookTestRequest({
      url: "https://hooks.example.com/demo",
      event: "task.unknown",
    })).toThrow("Unsupported webhook event.");
  });
});
