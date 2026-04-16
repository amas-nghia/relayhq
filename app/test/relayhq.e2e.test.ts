import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
  emptyVaultReadModel,
  selectBoardSummary,
  selectPendingApprovals,
  selectWorkspaceLinks,
  selectWorkspaceOverview,
} from "../data/relayhq-overview";
import { selectTaskWorkflow } from "../data/task-workflow";
import { VAULT_SCHEMA_VERSION, type TaskFrontmatter } from "../shared/vault/schema";
import { REDACTED_VALUE, redactSecrets } from "../server/services/security/secrets";
import { readCanonicalVaultReadModel } from "../server/services/vault/read";
import { createVaultTask, TaskCreateError } from "../server/services/vault/task-create";
import { VaultLockError, VaultStaleWriteError, getTaskLockState } from "../server/services/vault/lock";
import { readTaskDocument, serializeTaskDocument, syncTaskDocument, VaultSchemaError } from "../server/services/vault/write";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixtureVaultPath = join(repoRoot, "vault");

function createTask(overrides: Partial<TaskFrontmatter> = {}): TaskFrontmatter {
  return {
    id: "task-001",
    type: "task",
    version: VAULT_SCHEMA_VERSION,
    workspace_id: "ws-acme",
    project_id: "project-auth",
    board_id: "board-auth-main",
    column: "todo",
    status: "todo",
    priority: "high",
    title: "Implement password reset API",
    assignee: "agent-backend-dev",
    created_by: "@alice",
    created_at: "2026-04-14T10:00:00Z",
    updated_at: "2026-04-14T10:00:00Z",
    heartbeat_at: null,
    execution_started_at: null,
    execution_notes: null,
    progress: 0,
    approval_needed: false,
    approval_requested_by: null,
    approval_reason: null,
    approved_by: null,
    approved_at: null,
    approval_outcome: "pending",
    blocked_reason: null,
    blocked_since: null,
    result: null,
    completed_at: null,
    parent_task_id: null,
    depends_on: [],
    tags: [],
    links: [],
    locked_by: null,
    locked_at: null,
    lock_expires_at: null,
    ...overrides,
  };
}

async function createVaultFile(task: TaskFrontmatter, body = ""): Promise<{ readonly directory: string; readonly filePath: string }> {
  const directory = await mkdtemp(join(tmpdir(), "relayhq-e2e-"));
  const filePath = join(directory, "task-001.md");

  await writeFile(filePath, serializeTaskDocument(task, body), "utf8");

  return { directory, filePath };
}

async function createSeededVaultRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relayhq-phase1-regression-"));
  await cp(fixtureVaultPath, join(root, "vault"), { recursive: true });
  return root;
}

describe("RelayHQ vault hardening regression coverage", () => {
  test("applies clean writes and keeps log payloads secret-free", async () => {
    // Arrange
    const now = new Date("2026-04-14T12:00:00Z");
    const { filePath, directory } = await createVaultFile(createTask(), "## Notes\nAll clear.");

    try {
      // Act
      const result = await syncTaskDocument({
        filePath,
        actorId: "agent-backend-dev",
        now,
        mutate: () => ({
          status: "in-progress",
          progress: 45,
          execution_notes: "working through clean-up",
        }),
      });

      const logPayload = redactSecrets({
        actorId: "agent-backend-dev",
        message: "Bearer abcdefghijklmnopqrstuvwxyz012345",
      });

      // Assert
      expect(result.frontmatter.status).toBe("in-progress");
      expect(result.frontmatter.progress).toBe(45);
      expect(result.frontmatter.heartbeat_at).toBe(now.toISOString());

      const content = await readFile(filePath, "utf8");
      expect(content).toContain("progress: 45");
      expect(content).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
      expect(JSON.stringify(logPayload)).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
      expect(JSON.stringify(logPayload)).toContain(REDACTED_VALUE);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("rejects malformed writes and keeps the vault unchanged", async () => {
    // Arrange
    const now = new Date("2026-04-14T12:00:00Z");
    const { filePath, directory } = await createVaultFile(createTask(), "## Notes\nunchanged");
    const before = await readFile(filePath, "utf8");

    try {
      // Act
      const writeAttempt = syncTaskDocument({
        filePath,
        actorId: "agent-backend-dev",
        now,
        mutate: () => ({
          id: "task-999",
          api_key: "sk-live-raw-secret",
          execution_notes: "use token sk-live-1234567890abcdef",
        }),
      });

      // Assert
      await expect(writeAttempt).rejects.toBeInstanceOf(VaultSchemaError);
      const after = await readFile(filePath, "utf8");
      expect(after).toBe(before);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("blocks stale and contended locks before they can overwrite newer work", async () => {
    // Arrange
    const freshNow = new Date("2026-04-14T12:00:00Z");
    const stale = new Date("2026-04-14T10:00:00Z").toISOString();
    const freshLock = new Date("2026-04-14T12:10:00Z").toISOString();
    const { filePath, directory } = await createVaultFile(
      createTask({
        locked_by: "agent-a",
        locked_at: stale,
        heartbeat_at: stale,
        lock_expires_at: stale,
      }),
    );

    try {
      // Act
      const staleAttempt = syncTaskDocument({
        filePath,
        actorId: "agent-b",
        now: freshNow,
        staleAfterMs: 5 * 60 * 1000,
        mutate: () => ({ progress: 80 }),
      });

      const contendedTask = createTask({
        locked_by: "agent-a",
        locked_at: freshNow.toISOString(),
        heartbeat_at: freshNow.toISOString(),
        lock_expires_at: freshLock,
      });
      const contendedFile = join(directory, "task-002.md");
      await writeFile(contendedFile, serializeTaskDocument(contendedTask, "## Notes\ncontended"), "utf8");

      const contendedAttempt = syncTaskDocument({
        filePath: contendedFile,
        actorId: "agent-b",
        now: freshNow,
        mutate: () => ({ progress: 20 }),
      });

      // Assert
      await expect(staleAttempt).rejects.toBeInstanceOf(VaultStaleWriteError);
      await expect(contendedAttempt).rejects.toBeInstanceOf(VaultLockError);

      const staleDisk = await readTaskDocument(filePath);
      expect(staleDisk.frontmatter.progress).toBe(0);
      expect(getTaskLockState(staleDisk.frontmatter, freshNow, 5 * 60 * 1000).mode).toBe("stale");

      const contendedDisk = await readTaskDocument(contendedFile);
      expect(contendedDisk.frontmatter.progress).toBe(0);
      expect(getTaskLockState(contendedDisk.frontmatter, freshNow, 5 * 60 * 1000).mode).toBe("owned");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("RelayHQ Phase 1 seeded-vault regression coverage", () => {
  test("loads seeded dashboard data and primary navigation from the canonical vault", async () => {
    // Arrange
    const model = await readCanonicalVaultReadModel(repoRoot);

    // Act
    const workspace = selectWorkspaceOverview(model);
    const links = selectWorkspaceLinks(model);
    const pendingApprovals = selectPendingApprovals(model);

    // Assert
    expect(workspace.name).toBe("RelayHQ Demo Workspace");
    expect(workspace.summary).toContain("3 tasks");
    expect(workspace.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Tasks", value: "3" }),
        expect.objectContaining({ label: "Approvals", value: "1", note: "1 pending" }),
      ]),
    );
    expect(links).toEqual([
      {
        label: "Project overview",
        href: "/projects/project-demo",
        note: "Phase 1 Release Readiness",
      },
      {
        label: "Board overview",
        href: "/boards/board-demo",
        note: "Phase 1 Kanban Board",
      },
      {
        label: "Task workflow",
        href: "/tasks/task-001",
        note: "Seed shared vault demo data",
      },
    ]);
    expect(pendingApprovals).toEqual([
      {
        id: "approval-001",
        taskId: "task-003",
        taskTitle: "Review navigation and approvals flow",
        assignee: "agent-backend-dev",
        reason: "Approve the release-facing navigation and approvals UX before closing the slice.",
        requestedAt: "2026-04-15T09:22:00Z",
        requestedBy: "agent-backend-dev",
        projectId: "project-demo",
        boardId: "board-demo",
      },
    ]);
  });

  test("falls back to empty dashboard navigation when no vault data is available", () => {
    // Arrange
    const model = emptyVaultReadModel;

    // Act
    const workspace = selectWorkspaceOverview(model);
    const links = selectWorkspaceLinks(model);
    const pendingApprovals = selectPendingApprovals(model);

    // Assert
    expect(workspace.name).toBe("Workspace unavailable");
    expect(workspace.status).toBe("Awaiting vault data");
    expect(links).toEqual([
      {
        label: "Project overview",
        href: "/projects/project-unavailable",
        note: "Project unavailable",
      },
      {
        label: "Board overview",
        href: "/boards/board-unavailable",
        note: "Board unavailable",
      },
      {
        label: "Task workflow",
        href: "/tasks/task-unavailable",
        note: "Task unavailable",
      },
    ]);
    expect(pendingApprovals).toEqual([]);
  });

  test("maps seeded board data to task click-through routes and approval-aware task detail", async () => {
    // Arrange
    const model = await readCanonicalVaultReadModel(repoRoot);

    // Act
    const board = selectBoardSummary(model, "board-demo");
    const task = selectTaskWorkflow(model, "task-003");

    // Assert
    expect(board.name).toBe("Phase 1 Kanban Board");
    expect(board.columns.map((column) => column.id)).toEqual(["todo", "in-progress", "review", "done"]);
    expect(board.columns.find((column) => column.id === "review")?.tasks).toEqual([
      expect.objectContaining({
        id: "task-003",
        title: "Review navigation and approvals flow",
        status: "waiting-approval",
        approval: "pending",
      }),
    ]);
    expect(board.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/tasks/task-001" }),
      ]),
    );
    expect(`/tasks/${board.columns.find((column) => column.id === "review")?.tasks[0]?.id}`).toBe("/tasks/task-003");
    expect(task.title).toBe("Review navigation and approvals flow");
    expect(task.approvalState.status).toBe("pending");
    expect(task.timeline.map((step) => step.title)).toEqual(
      expect.arrayContaining(["Approval requested", "Waiting for decision", "Linked approval record"]),
    );
  });

  test("returns board and task fallbacks when navigation targets do not exist", () => {
    // Arrange
    const model = emptyVaultReadModel;

    // Act
    const board = selectBoardSummary(model, "missing-board");
    const task = selectTaskWorkflow(model, "missing-task");

    // Assert
    expect(board.name).toBe("Board unavailable");
    expect(board.columns).toEqual([]);
    expect(task.title).toBe("Task unavailable");
    expect(task.approvalState.status).toBe("not-needed");
    expect(task.timeline).toEqual([
      {
        title: "Task recorded",
        detail: "The task will populate from the vault once a shared record is available.",
        timestamp: "—",
        state: "current",
      },
    ]);
  });

  test("creates a seeded project task that appears in project, board, and task workflow views", async () => {
    // Arrange
    const root = await createSeededVaultRoot();
    const now = new Date("2026-04-16T10:00:00Z");

    try {
      // Act
      const created = await createVaultTask({
        title: "Verify release checklist coverage",
        projectId: "project-demo",
        boardId: "board-demo",
        column: "todo",
        priority: "medium",
        assignee: "agent-backend-dev",
        now,
        vaultRoot: root,
      });
      const model = await readCanonicalVaultReadModel(root);
      const board = selectBoardSummary(model, "board-demo");
      const workflow = selectTaskWorkflow(model, created.frontmatter.id);

      // Assert
      expect(created.frontmatter.created_by).toBe("@relayhq-web");
      expect(created.frontmatter.status).toBe("todo");
      expect(model.tasks.some((task) => task.id === created.frontmatter.id)).toBe(true);
      expect(board.columns.find((column) => column.id === "todo")?.tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: created.frontmatter.id,
            title: "Verify release checklist coverage",
            status: "todo",
          }),
        ]),
      );
      expect(workflow.title).toBe("Verify release checklist coverage");
      expect(workflow.approvalState.status).toBe("not-needed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("rejects invalid seeded task creation requests before they change the board", async () => {
    // Arrange
    const root = await createSeededVaultRoot();

    try {
      const before = await readCanonicalVaultReadModel(root);

      // Act
      const creationAttempt = createVaultTask({
        title: "This should fail",
        projectId: "project-demo",
        boardId: "missing-board",
        column: "todo",
        priority: "medium",
        assignee: "agent-backend-dev",
        vaultRoot: root,
      });

      // Assert
      await expect(creationAttempt).rejects.toEqual(
        expect.objectContaining<TaskCreateError>({
          statusCode: 404,
          message: "Board missing-board was not found.",
        }),
      );

      const after = await readCanonicalVaultReadModel(root);
      expect(after.tasks.map((task) => task.id)).toEqual(before.tasks.map((task) => task.id));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
