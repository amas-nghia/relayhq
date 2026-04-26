import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { readCanonicalVaultReadModel } from "./read";
import { createVaultTask, TaskCreateError } from "./task-create";
import { readTaskDocument } from "./write";
import { readWebhookSettings } from "../settings/webhooks";

async function writeVaultDocument(root: string, relativePath: string, frontmatter: string, body = ""): Promise<void> {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\n${frontmatter}\n---${body.length > 0 ? `\n${body}` : ""}\n`, "utf8");
}

async function createVaultRoot(): Promise<string> {
  const root = join(tmpdir(), `relayhq-task-create-${randomUUID()}`);

  await writeVaultDocument(
    root,
    "vault/shared/workspaces/ws-alpha.md",
    [
      "id: ws-alpha",
      "type: workspace",
      "name: Alpha Workspace",
      'owner_ids: ["@alice"]',
      'member_ids: ["@alice", "@bob"]',
      "created_at: 2026-04-14T10:00:00Z",
      "updated_at: 2026-04-14T10:00:00Z",
    ].join("\n"),
  );

  await writeVaultDocument(
    root,
    "vault/shared/projects/project-alpha.md",
    [
      "id: project-alpha",
      "type: project",
      "workspace_id: ws-alpha",
      "name: Alpha Project",
      "created_at: 2026-04-14T10:00:00Z",
      "updated_at: 2026-04-14T10:00:00Z",
    ].join("\n"),
  );

  await writeVaultDocument(
    root,
    "vault/shared/boards/board-alpha.md",
    [
      "id: board-alpha",
      "type: board",
      "workspace_id: ws-alpha",
      "project_id: project-alpha",
      "name: Alpha Board",
      "created_at: 2026-04-14T10:00:00Z",
      "updated_at: 2026-04-14T10:00:00Z",
    ].join("\n"),
  );

  await writeVaultDocument(
    root,
    "vault/shared/columns/todo.md",
    [
      "id: todo",
      "type: column",
      "workspace_id: ws-alpha",
      "project_id: project-alpha",
      "board_id: board-alpha",
      "name: Todo",
        "position: 0",
      "created_at: 2026-04-14T10:00:00Z",
      "updated_at: 2026-04-14T10:00:00Z",
    ].join("\n"),
  );

  await writeVaultDocument(
    root,
    "vault/shared/columns/in-progress.md",
    [
      "id: in-progress",
      "type: column",
      "workspace_id: ws-alpha",
      "project_id: project-alpha",
      "board_id: board-alpha",
      "name: In Progress",
        "position: 1",
      "created_at: 2026-04-14T10:00:00Z",
      "updated_at: 2026-04-14T10:00:00Z",
    ].join("\n"),
  );

  return root;
}

async function writeWebhookSettingsFile(root: string): Promise<void> {
  const filePath = join(root, "vault", "shared", "settings", "webhooks.json");
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({
    webhooks: [{ id: "webhook-1", url: "https://hooks.slack.com/services/T000/B000/secret", events: ["task.created"] }],
    deliveries: [],
  }, null, 2)}\n`, "utf8");
}

async function waitForWebhookDelivery(root: string): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const loaded = await readWebhookSettings(root);
    if (loaded.deliveries.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for webhook delivery.");
}

describe("createVaultTask", () => {
  test("creates a canonical task file that appears in the read model", async () => {
    const root = await createVaultRoot();
    const now = new Date("2026-04-16T10:00:00Z");

    try {
      const result = await createVaultTask({
        title: "Ship project create flow",
        projectId: "project-alpha",
        boardId: "board-alpha",
        columnId: "todo",
        priority: "high",
        assignee: "agent-backend-dev",
        now,
        vaultRoot: root,
      });

      expect(result.frontmatter.id).toMatch(/^task-/);
      expect(result.frontmatter.created_by).toBe("@relayhq-web");
      expect(result.frontmatter.status).toBe("todo");
      expect(result.frontmatter.column).toBe("todo");

      const diskState = await readTaskDocument(result.filePath);
      expect(diskState.frontmatter.title).toBe("Ship project create flow");
      expect(diskState.frontmatter.project_id).toBe("project-alpha");
      expect(diskState.frontmatter.board_id).toBe("board-alpha");

      const model = await readCanonicalVaultReadModel(root);
      expect(model.tasks.some((task) => task.id === result.frontmatter.id)).toBe(true);

      const boardTask = model.tasks.find((task) => task.id === result.frontmatter.id);
      expect(boardTask).toMatchObject({
        title: "Ship project create flow",
        boardId: "board-alpha",
        columnId: "todo",
      });

      expect(model.boards.find((entry) => entry.id === "board-alpha")?.taskIds).toEqual(
        expect.arrayContaining([result.frontmatter.id]),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("emits a task.created webhook for subscribed integrations", async () => {
    const root = await createVaultRoot();
    await writeWebhookSettingsFile(root);
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async (_url: string, init?: RequestInit) => {
      fetchCalls += 1;
      expect(init?.headers).toMatchObject({
        "x-relayhq-event": "task.created",
      });
      expect(String(init?.body)).toContain("[RelayHQ] task.created • Ship project create flow");
      return new Response(null, { status: 200 });
    };

    try {
      const now = new Date("2026-04-16T10:00:00Z");
      const result = await createVaultTask({
        title: "Ship project create flow",
        projectId: "project-alpha",
        boardId: "board-alpha",
        columnId: "todo",
        priority: "high",
        assignee: "agent-backend-dev",
        now,
        vaultRoot: root,
      });

      await waitForWebhookDelivery(root);

      expect(fetchCalls).toBe(1);
      const loaded = await readWebhookSettings(root);
      expect(loaded.deliveries[0]?.event).toBe("task.created");
      expect(loaded.deliveries[0]?.status).toBe("success");
      expect(result.frontmatter.title).toBe("Ship project create flow");
    } finally {
      globalThis.fetch = originalFetch;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects secret-bearing task input before writing", async () => {
    const root = await createVaultRoot();

    try {
      await expect(
        createVaultTask({
          title: "Use sk-live-1234567890abcdef in prod",
          projectId: "project-alpha",
          boardId: "board-alpha",
          columnId: "todo",
          priority: "high",
          assignee: "agent-backend-dev",
          vaultRoot: root,
        }),
      ).rejects.toEqual(expect.objectContaining<TaskCreateError>({ statusCode: 400 }));

      const model = await readCanonicalVaultReadModel(root);
      expect(model.tasks).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
