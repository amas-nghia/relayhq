import { describe, expect, test } from "bun:test";

import { sendSessionMessage } from "./messages.post";

describe("POST /api/agent/sessions/[sessionId]/messages", () => {
  test("forwards input to a running session and records a user event", async () => {
    const events: Array<Record<string, unknown>> = []

    const result = await sendSessionMessage('runner-1', { message: 'continue with the task' }, {
      getRunner: () => ({
        id: 'runner-1',
        sessionId: 'runner-1',
        agentName: 'gpt-4-0-lumina',
        taskId: 'task-001',
        provider: 'openai',
        runtimeKind: 'opencode',
        launchMode: 'fresh',
        resumedFromSessionId: null,
        status: 'running',
        command: 'opencode',
        args: [],
        cwd: '/tmp/project',
        startTime: new Date().toISOString(),
        lastEventAt: new Date().toISOString(),
      }),
      sendInput: () => ({ success: true, sessionId: 'runner-1' }),
      appendEvent: async (_root, event) => { events.push(event as unknown as Record<string, unknown>) },
      resolveRoot: () => '/tmp/relayhq-vault',
    })

    expect(result).toEqual({ success: true, sessionId: 'runner-1' })
    expect(events[0]).toMatchObject({
      sessionId: 'runner-1',
      agentId: 'gpt-4-0-lumina',
      taskId: 'task-001',
      type: 'user.message',
      text: 'continue with the task',
    })
  })
})
