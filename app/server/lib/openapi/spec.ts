import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

// Build the full OpenAPI spec in one self-contained function.
// No singleton registry — Nitro bundles each handler separately so module-level
// singletons are not reliably shared. Everything is constructed fresh per call.
export function generateOpenApiSpec() {
  const registry = new OpenAPIRegistry();

  // ── Common schemas ─────────────────────────────────────────────────────

  const TaskPrioritySchema = z.enum(["critical", "high", "medium", "low"]);
  const TaskStatusSchema = z.enum(["todo", "scheduled", "in-progress", "blocked", "review", "waiting-approval", "done", "cancelled"]);

  const TaskSummarySchema = registry.register(
    "TaskSummary",
    z.object({
      id: z.string(),
      title: z.string(),
      status: TaskStatusSchema,
      priority: TaskPrioritySchema,
      assignee: z.string(),
      column: z.enum(["todo", "in-progress", "review", "done"]),
      project_id: z.string(),
      board_id: z.string(),
      created_at: z.string().datetime(),
      updated_at: z.string().datetime(),
    }),
  );

  const ErrorSchema = registry.register(
    "Error",
    z.object({ statusCode: z.number(), statusMessage: z.string() }),
  );

  const ActorBodySchema = z.object({ actorId: z.string().min(1) });

  // ── Tasks ──────────────────────────────────────────────────────────────

  registry.registerPath({
    method: "post",
    path: "/api/vault/tasks",
    summary: "Create a task",
    tags: ["Tasks"],
    request: {
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              title: z.string().min(1),
              projectId: z.string().min(1),
              boardId: z.string().min(1),
              columnId: z.string().min(1),
              priority: TaskPrioritySchema,
              assignee: z.string().optional(),
              requiredCapability: z.string().optional(),
              tags: z.array(z.string()).optional(),
              dependsOn: z.array(z.string()).optional(),
              objective: z.string().optional(),
              acceptanceCriteria: z.array(z.string()).optional(),
              constraints: z.array(z.string()).optional(),
              contextFiles: z.array(z.string()).optional(),
              templateId: z.string().optional(),
              cron_schedule: z.string().optional(),
              sourceIssueId: z.string().optional(),
              github_issue_id: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Task created",
        content: {
          "application/json": {
            schema: registry.register("CreateTaskResponse", z.object({
              taskId: z.string(),
              boardId: z.string(),
              sourcePath: z.string(),
              autoDispatch: z.object({
                launched: z.boolean(),
                decision: z.object({ status: z.string(), reason: z.string() }),
              }).optional(),
            })),
          },
        },
      },
      400: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/vault/tasks/{id}",
    summary: "Update a task (status, progress, assignee, etc.)",
    tags: ["Tasks"],
    request: {
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              actorId: z.string().min(1),
              patch: z.record(z.string(), z.unknown()),
              autoRun: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Task updated", content: { "application/json": { schema: TaskSummarySchema } } },
      400: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
      404: { description: "Task not found", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/vault/tasks/{id}/claim",
    summary: "Agent claims a task (locks it, sets status in-progress)",
    tags: ["Tasks"],
    request: {
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: ActorBodySchema.extend({ assignee: z.string().optional() }),
          },
        },
      },
    },
    responses: {
      200: { description: "Task claimed" },
      400: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
      409: { description: "Task already locked by another agent", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/vault/tasks/{id}/heartbeat",
    summary: "Agent heartbeat — confirms task is still being worked",
    tags: ["Tasks"],
    request: {
      params: z.object({ id: z.string() }),
      body: { required: true, content: { "application/json": { schema: ActorBodySchema } } },
    },
    responses: {
      200: { description: "Heartbeat recorded" },
      400: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/vault/tasks/{id}/request-approval",
    summary: "Agent signals work is done and requests human review",
    tags: ["Tasks"],
    request: {
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: ActorBodySchema.extend({ reason: z.string().min(1) }),
          },
        },
      },
    },
    responses: {
      200: { description: "Status set to waiting-approval" },
      400: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/vault/tasks/{id}/approve",
    summary: "Human approves completed work",
    tags: ["Tasks"],
    request: {
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: ActorBodySchema.extend({ comment: z.string().optional() }),
          },
        },
      },
    },
    responses: {
      200: { description: "Task approved and moved to done" },
      403: { description: "Only humans can approve", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/vault/tasks/{id}/reject",
    summary: "Human rejects work, sends back for rework",
    tags: ["Tasks"],
    request: {
      params: z.object({ id: z.string() }),
      body: {
        required: true,
        content: {
          "application/json": {
            schema: ActorBodySchema.extend({ comment: z.string().optional() }),
          },
        },
      },
    },
    responses: {
      200: { description: "Task rejected, status reset to todo" },
      403: { description: "Only humans can reject", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/vault/read-model",
    summary: "Full workspace snapshot — tasks, projects, boards, columns, agents",
    tags: ["Vault"],
    responses: { 200: { description: "VaultReadModel" } },
  });

  // ── Agents ─────────────────────────────────────────────────────────────

  registry.registerPath({
    method: "post",
    path: "/api/vault/agents",
    summary: "Register an agent in the vault",
    tags: ["Agents"],
    request: {
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(1),
              role: z.string().min(1),
              model: z.string().min(1),
              provider: z.string().min(1),
              apiKeyRef: z.string().regex(/^(env:|secret:|vault:)/).optional()
                .describe("Must use env:VAR, secret:name, or vault:path prefix"),
              runtimeKind: z.enum(["claude-code", "opencode", "codex", "custom", "webhook"]).optional(),
              runMode: z.enum(["foreground", "background"]).optional(),
              runCommand: z.string().optional(),
              aliases: z.array(z.string()).optional(),
              monthlyBudgetUsd: z.number().positive().optional(),
              webhookUrl: z.string().url().optional(),
              supportsResume: z.boolean().optional(),
              bootstrapStrategy: z.enum(["full", "minimal"]).optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Agent registered",
        content: {
          "application/json": {
            schema: registry.register("AgentResponse", z.object({
              agent: z.object({ id: z.string(), name: z.string(), role: z.string(), provider: z.string(), model: z.string(), status: z.string() }),
              sourcePath: z.string(),
            })),
          },
        },
      },
      400: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
      409: { description: "Agent ID already exists", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/agent/{id}/run",
    summary: "Dispatch and launch an agent session",
    tags: ["Agents"],
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              taskId: z.string().optional(),
              launchSurface: z.enum(["foreground", "background"]).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Session launched or dispatch decision returned" },
      404: { description: "Agent not found", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/agent/session",
    summary: "Workspace context + task list for agent session start",
    tags: ["Agents"],
    responses: { 200: { description: "Session bootstrap context" } },
  });

  registry.registerPath({
    method: "get",
    path: "/api/agent/context",
    summary: "Full bootstrap pack with matched skills injected",
    tags: ["Agents"],
    responses: { 200: { description: "Bootstrap pack" } },
  });

  // ── Projects ───────────────────────────────────────────────────────────

  registry.registerPath({
    method: "post",
    path: "/api/vault/projects",
    summary: "Create a project with default board and 4 columns",
    tags: ["Projects"],
    request: {
      body: {
        required: true,
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(1),
              codebaseRoot: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "Project created",
        content: {
          "application/json": {
            schema: registry.register("ProjectResponse", z.object({
              project: z.object({ id: z.string(), name: z.string(), codebaseRoot: z.string().nullable() }),
              board: z.object({ id: z.string(), name: z.string() }),
              columns: z.array(z.object({ id: z.string(), name: z.string() })),
            })),
          },
        },
      },
      400: { description: "Validation error", content: { "application/json": { schema: ErrorSchema } } },
    },
  });

  // ── System ─────────────────────────────────────────────────────────────

  registry.registerPath({
    method: "post",
    path: "/api/vault/init",
    summary: "Seed an empty vault with default workspace, project, board, and columns",
    tags: ["System"],
    responses: { 200: { description: "Vault initialized" } },
  });

  registry.registerPath({
    method: "get",
    path: "/api/health",
    summary: "Health check",
    tags: ["System"],
    responses: { 200: { description: "Server is healthy" } },
  });

  // ── Generate ───────────────────────────────────────────────────────────

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.0",
    info: {
      title: "RelayHQ API",
      version: "1.0.0",
      description: "Vault-first Kanban control plane for coordinating humans and agents.",
    },
    servers: [{ url: "http://localhost:44210", description: "Local dev" }],
  });
}
