import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { openCoordinatorThread, parseCoordinatorThreadDocument } from "./coordinator-thread";
import { serializeProjectDocument } from "./project-write";
import type { ProjectFrontmatter } from "./repository";

async function createVaultRoot(): Promise<string> {
  const root = join(tmpdir(), `relayhq-coordinator-thread-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
  await mkdir(join(root, "vault/shared/projects"), { recursive: true });
  return root;
}

async function writeProject(root: string): Promise<void> {
  const project = {
    id: "project-demo",
    type: "project" as const,
    workspace_id: "ws-demo",
    name: "Demo Project",
    coordinator_agent_id: "agent-coordinator",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  } satisfies ProjectFrontmatter;
  await writeFile(join(root, "vault/shared/projects/project-demo.md"), serializeProjectDocument(project, ""), "utf8");
}

describe("coordinator thread vault service", () => {
  test("creates a durable project coordinator thread", async () => {
    const root = await createVaultRoot();
    await writeProject(root);

    const result = await openCoordinatorThread({
      vaultRoot: root,
      projectId: "project-demo",
      coordinatorAgentId: "agent-coordinator",
      now: new Date("2026-05-01T00:00:00.000Z"),
    });

    expect(result.created).toBe(true);
    expect(result.frontmatter.id).toBe("coordinator-thread-project-demo");
    expect(result.frontmatter.project_id).toBe("project-demo");
    expect(result.frontmatter.coordinator_agent_id).toBe("agent-coordinator");
    expect(result.frontmatter.active_session_id).toBeNull();
    expect(result.frontmatter.status).toBe("active");

    const persisted = parseCoordinatorThreadDocument(await readFile(result.filePath, "utf8"));
    expect(persisted.frontmatter.id).toBe(result.frontmatter.id);
  });

  test("returns the same active thread on repeated open", async () => {
    const root = await createVaultRoot();
    await writeProject(root);

    const first = await openCoordinatorThread({ vaultRoot: root, projectId: "project-demo", coordinatorAgentId: "agent-coordinator" });
    const second = await openCoordinatorThread({ vaultRoot: root, projectId: "project-demo", coordinatorAgentId: "agent-coordinator" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.frontmatter.id).toBe(first.frontmatter.id);
    expect(second.filePath).toBe(first.filePath);
  });

  test("updates the active session without changing thread identity", async () => {
    const root = await createVaultRoot();
    await writeProject(root);

    const opened = await openCoordinatorThread({ vaultRoot: root, projectId: "project-demo", coordinatorAgentId: "agent-coordinator" });
    await openCoordinatorThread({ vaultRoot: root, projectId: "project-demo", coordinatorAgentId: "agent-coordinator", activeSessionId: "ignored-new-session" });

    const persisted = parseCoordinatorThreadDocument(await readFile(opened.filePath, "utf8"));
    expect(persisted.frontmatter.id).toBe("coordinator-thread-project-demo");
    expect(persisted.frontmatter.active_session_id).toBeNull();
  });
});
