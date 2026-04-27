import { describe, expect, test } from "bun:test";

import { handleMcpMessage, RELAYHQ_MCP_TOOLS } from "../../packages/relayhq-mcp/bin/relayhq-mcp.mjs";

describe("relayhq-mcp", () => {
  test("advertises the workflow tools", async () => {
    const response = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(response?.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "relayhq_inbox",
      "relayhq_start",
      "relayhq_progress",
      "relayhq_done",
      "relayhq_blocked",
    ]);
    expect(RELAYHQ_MCP_TOOLS).toHaveLength(5);
  });

  test("starts a task by claiming and fetching bootstrap context", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (String(url).includes("/claim")) {
        return new Response(JSON.stringify({ claimed: true }), { status: 200, headers: { "content-type": "application/json" } });
      }

      return new Response(JSON.stringify({ bootstrap: true }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const response = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "relayhq_start", arguments: { agentId: "agent-1", taskId: "task-1" } },
    }, { fetchFn, baseUrl: "http://relayhq.test" });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toContain("/api/vault/tasks/task-1/claim");
    expect(calls[1]?.url).toContain("/api/agent/bootstrap/task-1");
    expect(response?.result.content[0].text).toContain('"claimed": true');
    expect(response?.result.content[0].text).toContain('"bootstrap": true');
  });

  test("reads inbox from the agent state endpoint", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ active: null, inbox: [], pool: [] }), { status: 200, headers: { "content-type": "application/json" } });
    };

    await handleMcpMessage({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "relayhq_inbox", arguments: { agentId: "claude-code" } },
    }, { fetchFn, baseUrl: "http://relayhq.test" });

    expect(calls[0]?.url).toContain("/api/agent/state?agentId=claude-code");
  });

  test("reports progress with patch then heartbeat", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const response = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "relayhq_progress", arguments: { agentId: "agent-1", taskId: "task-1", progress: 42, notes: "Working" } },
    }, { fetchFn, baseUrl: "http://relayhq.test" });

    expect(calls[0]?.url).toContain("/api/vault/tasks/task-1");
    expect(calls[1]?.url).toContain("/api/vault/tasks/task-1/heartbeat");
    expect(response?.result.content[0].text).toContain('"heartbeat"');
  });

  test("marks completed work for review, not done", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
    };

    await handleMcpMessage({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "relayhq_done", arguments: { agentId: "agent-1", taskId: "task-1", result: "Completed" } },
    }, { fetchFn, baseUrl: "http://relayhq.test" });

    expect(calls[0]?.init?.body).toContain('"status":"review"');
    expect(calls[0]?.init?.body).toContain('"column":"review"');
  });
});
