import { defineEventHandler, getQuery } from "h3";

import type { VaultReadModel } from "../../models/read-model";
import { readAgentRuntimeReadiness, type AgentRuntimeReadiness } from "../../services/agents/runtime-readiness";
import { readCanonicalVaultReadModel } from "../../services/vault/read";
import { resolveVaultWorkspaceRoot } from "../../services/vault/runtime";

export interface AgentHelpEndpoint {
  readonly name: string;
  readonly method: "GET" | "POST" | "PATCH" | "DELETE";
  readonly path: string;
  readonly purpose: string;
  readonly body?: Record<string, unknown>;
}

export interface AgentHelpResponse {
  readonly product: "RelayHQ";
  readonly version: string;
  readonly baseUrl: string;
  readonly mode: "control-plane";
  readonly notes: ReadonlyArray<string>;
  readonly workflows: {
    readonly happyPath: ReadonlyArray<string>;
  };
  readonly endpoints: ReadonlyArray<AgentHelpEndpoint>;
  readonly rules: {
    readonly humanOnlyTransitions: ReadonlyArray<string>;
    readonly agentCompletionRule: string;
    readonly lockRule: string;
  };
  readonly supportedRuntimes: ReadonlyArray<{
    readonly runtime: string;
    readonly status: "supported" | "experimental";
  }>;
  readonly runtimeExamples: ReadonlyArray<{
    readonly runtime: string;
    readonly launch: {
      readonly command: string;
      readonly args: ReadonlyArray<string>;
      readonly cwdStrategy: "spawn-cwd" | "runtime-flag" | "pty-wrapper";
      readonly outputMode: "json" | "stream-json" | "text";
    };
    readonly notes: ReadonlyArray<string>;
  }>;
  readonly taskStatusModel: {
    readonly queueColumns: ReadonlyArray<string>;
    readonly activeStatus: ReadonlyArray<string>;
    readonly failureStatus: ReadonlyArray<string>;
    readonly handoffStatus: ReadonlyArray<string>;
    readonly terminalStatus: ReadonlyArray<string>;
  };
  readonly agentRuntimeHint?: {
    readonly agentId: string;
    readonly runtimeKind: string | null;
    readonly verificationStatus: AgentRuntimeReadiness["verificationStatus"];
  };
}

interface ReadAgentHelpDependencies {
  readonly readModelReader?: (vaultRoot: string) => Promise<VaultReadModel>;
  readonly resolveRoot?: () => string;
  readonly baseUrl?: string;
}

function buildHelpResponse(baseUrl: string): AgentHelpResponse {
  return {
    product: "RelayHQ",
    version: "0.1",
    baseUrl,
    mode: "control-plane",
    notes: [
      "RelayHQ coordinates work; bound runtimes execute work.",
      "Use actorId exactly as the assigned agent id for all task lifecycle calls.",
    ],
    workflows: {
      happyPath: [
        "Read assigned task context",
        "Claim task if needed",
        "Do work in repo",
        "Send heartbeats or progress",
        "Request approval if needed",
        "Patch task to review when complete",
      ],
    },
    endpoints: [
      {
        name: "Get projects",
        method: "GET",
        path: "/api/vault/projects",
        purpose: "List projects",
      },
      {
        name: "Get read model",
        method: "GET",
        path: "/api/vault/read-model",
        purpose: "Read full coordination state",
      },
      {
        name: "Get bootstrap pack",
        method: "GET",
        path: "/api/agent/bootstrap/{taskId}?agentId={agentId}",
        purpose: "Get task context and protocol instructions",
      },
      {
        name: "Claim task",
        method: "POST",
        path: "/api/vault/tasks/{taskId}/claim",
        purpose: "Claim task and move to in-progress",
        body: { actorId: "<agent-id>" },
      },
      {
        name: "Heartbeat task",
        method: "POST",
        path: "/api/vault/tasks/{taskId}/heartbeat",
        purpose: "Refresh lock and liveness",
        body: { actorId: "<agent-id>" },
      },
      {
        name: "Update task",
        method: "PATCH",
        path: "/api/vault/tasks/{taskId}",
        purpose: "Update progress, notes, status, or result",
        body: {
          actorId: "<agent-id>",
          patch: {
            progress: 50,
            execution_notes: "Working on the file edit",
          },
        },
      },
      {
        name: "Request approval",
        method: "POST",
        path: "/api/vault/tasks/{taskId}/request-approval",
        purpose: "Pause for human approval",
        body: {
          actorId: "<agent-id>",
          reason: "Need approval before risky change",
        },
      },
      {
        name: "Move to review",
        method: "PATCH",
        path: "/api/vault/tasks/{taskId}",
        purpose: "Submit completed work for human review",
        body: {
          actorId: "<agent-id>",
          patch: {
            status: "review",
            progress: 100,
            result: "Created hello-world.txt in repo root",
          },
        },
      },
    ],
    rules: {
      humanOnlyTransitions: ["review -> done", "review -> todo"],
      agentCompletionRule: "Agents must stop at review; humans close to done.",
      lockRule: "Only the lock owner may mutate a claimed task unless lock recovery applies.",
    },
    supportedRuntimes: [
      { runtime: "opencode", status: "supported" },
      { runtime: "claude-code", status: "experimental" },
      { runtime: "codex", status: "experimental" },
    ],
    runtimeExamples: [
      {
        runtime: "opencode",
        launch: {
          command: "opencode",
          args: ["run", "<prompt>", "--format", "json", "--dangerously-skip-permissions", "--dir", "<repo-root>"],
          cwdStrategy: "pty-wrapper",
          outputMode: "json",
        },
        notes: [
          "Preferred v0.1 runtime for RelayHQ.",
          "Use a pseudo-TTY wrapper in harnesses if direct stdio pipes do not emit events reliably.",
          "The prompt should use actorId exactly as the assigned agent id for API calls.",
        ],
      },
      {
        runtime: "claude-code",
        launch: {
          command: "claude",
          args: ["-p", "<prompt>", "--output-format", "stream-json", "--allowedTools", "Bash,Write,Read,Edit,Glob,Grep"],
          cwdStrategy: "spawn-cwd",
          outputMode: "stream-json",
        },
        notes: [
          "Experimental in v0.1.",
          "Claude examples must use actorId, not agentId, for RelayHQ API calls.",
          "Use spawn cwd for repo root; Claude does not rely on a --dir flag in this integration.",
        ],
      },
      {
        runtime: "codex",
        launch: {
          command: "codex",
          args: ["<prompt>"],
          cwdStrategy: "spawn-cwd",
          outputMode: "text",
        },
        notes: [
          "Experimental in v0.1.",
          "Add runtime-specific structured output parsing before relying on Codex transcripts in production.",
        ],
      },
    ],
    taskStatusModel: {
      queueColumns: ["todo", "scheduled"],
      activeStatus: ["in-progress"],
      failureStatus: ["failed"],
      handoffStatus: ["review"],
      terminalStatus: ["done", "cancelled"],
    },
  };
}

export async function readAgentHelp(
  dependencies: ReadAgentHelpDependencies = {},
  options: { agentId?: string | null } = {},
): Promise<AgentHelpResponse> {
  const resolveRoot = dependencies.resolveRoot ?? resolveVaultWorkspaceRoot;
  const readModelReader = dependencies.readModelReader ?? readCanonicalVaultReadModel;
  const baseUrl = dependencies.baseUrl ?? (process.env.RELAYHQ_BASE_URL ?? "http://127.0.0.1:44210");
  const response = buildHelpResponse(baseUrl);

  if (!options.agentId) {
    return response;
  }

  const readModel = await readModelReader(resolveRoot());
  const agent = readModel.agents.find((entry) => entry.id === options.agentId) ?? null;
  if (agent === null) {
    return response;
  }

  const readiness = readAgentRuntimeReadiness(agent);
  return {
    ...response,
    agentRuntimeHint: {
      agentId: agent.id,
      runtimeKind: readiness.runtimeKind,
      verificationStatus: readiness.verificationStatus,
    },
  };
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  return await readAgentHelp({}, {
    agentId: typeof query.agentId === "string" ? query.agentId : typeof query.agent_id === "string" ? query.agent_id : null,
  });
});
