import { execFileSync } from "node:child_process";

import { describe, expect, test } from "bun:test";

import { agentRunnerManager, isRunnerSessionReusable } from "./manager";

describe("runner session reuse", () => {
  test("treats running and handed-off sessions as reusable", () => {
    expect(isRunnerSessionReusable({ status: "running" })).toBe(true)
    expect(isRunnerSessionReusable({ status: "handed-off" })).toBe(true)
  })

  test("does not treat completed or failed sessions as reusable", () => {
    expect(isRunnerSessionReusable({ status: "completed" })).toBe(false)
    expect(isRunnerSessionReusable({ status: "failed" })).toBe(false)
    expect(isRunnerSessionReusable({ status: "stopped" })).toBe(false)
  })

  test("stops the whole background process group", async () => {
    const sessionId = `runner-test-${Date.now()}`
    const runner = agentRunnerManager.startRunner({
      sessionId,
      agentName: 'test-agent',
      provider: 'custom',
      runtimeKind: 'custom-subprocess',
      launchSurface: 'background',
      prompt: 'sleep',
      command: 'bash',
      args: ['-lc', 'sleep 30'],
    })

    expect(typeof runner.pid).toBe('number')
    expect(agentRunnerManager.stopRunner(sessionId, 'test shutdown')).toBe(true)

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(agentRunnerManager.getRunner(sessionId)?.status).toBe('stopped')
    expect(agentRunnerManager.getRunner(sessionId)?.stopReason).toBe('test shutdown')

    expect(() => execFileSync('ps', ['-p', String(runner.pid)])).toThrow()
  })
})
