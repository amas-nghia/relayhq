import { describe, expect, test } from "bun:test";

import { runHttpAgentAdapter } from "./http-adapter";

describe("http adapter", () => {
  test("rejects non-env api_key_ref values", async () => {
    await expect(runHttpAgentAdapter({
      vaultRoot: "/tmp/relayhq",
      taskId: "task-001",
      agentId: "codex-account-1",
      provider: "codex",
      model: "gpt-4.1",
      apiKeyRef: "secret:OPENAI",
      prompt: "hello",
      env: {},
    })).rejects.toMatchObject({ statusCode: 422 })
  })

  test("rejects missing env api keys", async () => {
    await expect(runHttpAgentAdapter({
      vaultRoot: "/tmp/relayhq",
      taskId: "task-001",
      agentId: "codex-account-1",
      provider: "codex",
      model: "gpt-4.1",
      apiKeyRef: "env:OPENAI_API_KEY_ACCOUNT_1",
      prompt: "hello",
      env: {},
    })).rejects.toMatchObject({ statusCode: 422 })
  })
})
