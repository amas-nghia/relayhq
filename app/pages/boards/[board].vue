<script setup lang="ts">
import { computed, ref } from "vue";
import EmptyState from "../../components/EmptyState.vue";
import BoardColumnList from "../../components/boards/BoardColumnList.vue";
import ProjectSummaryCard from "../../components/projects/ProjectSummaryCard.vue";
import TaskCreateForm from "../../components/tasks/TaskCreateForm.vue";
import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
  selectBoardSummary,
  selectProjectSummary,
  selectWorkspaceLinks,
} from "../../data/relayhq-overview";

const route = useRoute();

const boardId = computed(() => {
  const value = route.params.board;
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
});

const { data: vault } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
});

const board = computed(() => selectBoardSummary(vault.value, boardId.value));
const project = computed(() => selectProjectSummary(vault.value, board.value.projectId));
const workspaceLinks = computed(() => selectWorkspaceLinks(vault.value));
const hasBoardData = computed(() => vault.value.boards.some((entry) => entry.id === boardId.value));
const isTaskCreateVisible = ref(false);

const boardOptions = computed(() => {
  if (!hasBoardData.value) {
    return [];
  }

  return [{ id: board.value.id, name: board.value.name }];
});

const boardColumns = computed(() =>
  vault.value.columns
    .filter((entry) => entry.boardId === boardId.value)
    .map((entry) => ({ id: entry.id, name: entry.name, boardId: entry.boardId, position: entry.position }))
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .map(({ position: _position, ...column }) => column),
);

const assigneeOptions = computed(() => {
  const values = new Set<string>();

  for (const agent of vault.value.agents) {
    if (agent.workspaceId === board.value.workspaceId) {
      values.add(agent.id);
    }
  }

  for (const task of vault.value.tasks) {
    if (task.boardId === boardId.value) {
      values.add(task.assignee);
    }
  }

  return [...values].sort((left, right) => left.localeCompare(right));
});

function toggleTaskCreate(): void {
  isTaskCreateVisible.value = !isTaskCreateVisible.value;
}

function handleTaskCreateCancel(): void {
  isTaskCreateVisible.value = false;
}

async function handleTaskCreated(): Promise<void> {
  await refreshNuxtData(relayhqReadModelKey);
  isTaskCreateVisible.value = false;
}
</script>

<template>
  <div class="board-page">
    <EmptyState
      v-if="!hasBoardData"
      title="No board data found"
      description="This route does not map to a shared board record yet. Seed vault/shared/boards and linked task files to populate the board view."
      action-label="Open workspace overview"
      action-href="/"
    />

    <template v-else>
    <section class="page-intro" aria-labelledby="board-page-title">
      <div class="intro-copy">
        <p class="eyebrow">Board overview</p>
        <h1 id="board-page-title">{{ board.name }}</h1>
        <p>
          This page shows the board as a control-plane surface for vault-backed coordination.
        </p>
      </div>

      <div class="intro-actions">
        <button
          class="new-task-button"
          type="button"
          :aria-expanded="isTaskCreateVisible"
          aria-controls="board-task-create"
          @click="toggleTaskCreate"
        >
          {{ isTaskCreateVisible ? "Close task form" : "+ New Task" }}
        </button>
      </div>

      <nav class="page-links" aria-label="Primary views">
        <NuxtLink v-for="link in workspaceLinks" :key="link.href" class="page-link" :to="link.href">
          <span>{{ link.label }}</span>
          <small>{{ link.note }}</small>
        </NuxtLink>
      </nav>
    </section>

    <ProjectSummaryCard
      :id="project.id"
      :title="project.name"
      :workspace-id="project.workspaceId"
      :workspace-name="project.workspaceName"
      :board-id="project.boardId"
      :board-name="project.boardName"
      :status="project.status"
      :source-path="project.sourcePath"
      :summary="project.summary"
      :metrics="project.metrics"
      :workflow="project.workflow"
      :links="project.links"
    />

    <TaskCreateForm
      v-if="isTaskCreateVisible"
      id="board-task-create"
      :project-id="project.id"
      :project-name="project.name"
      :boards="boardOptions"
      :columns="boardColumns"
      :assignees="assigneeOptions"
      :initial-board-id="board.id"
      @cancel="handleTaskCreateCancel"
      @created="handleTaskCreated"
    />

    <BoardColumnList
      :board-id="board.id"
      :board-name="board.name"
      :summary="board.summary"
      :metrics="board.metrics"
      :columns="board.columns"
    />

    <section class="board-notes" aria-label="Board workflow notes">
      <article class="info-card">
        <p class="section-kicker">Workflow boundary</p>
        <h2>What the board does</h2>
        <ul class="check-list" role="list">
          <li>Shows committed column flow for the current project</li>
          <li>Makes approval gates visible before work moves forward</li>
          <li>Surfaces task ownership, priority, and progress</li>
          <li>Leaves execution to the external runtime</li>
        </ul>
      </article>

      <article class="info-card">
        <p class="section-kicker">Vault mapping</p>
        <h2>Shared records in view</h2>
        <dl class="state-list">
          <div>
            <dt>Board file</dt>
            <dd>{{ board.sourcePath }}</dd>
          </div>
          <div>
            <dt>Project file</dt>
            <dd>{{ project.sourcePath }}</dd>
          </div>
          <div>
            <dt>Workspace</dt>
            <dd>{{ board.workspaceName }}</dd>
          </div>
          <div>
            <dt>Coordination mode</dt>
            <dd>Kanban-first control plane</dd>
          </div>
        </dl>
      </article>
    </section>
    </template>
  </div>
</template>

<style scoped>
.board-page {
  display: grid;
  gap: 1rem;
}

.page-intro,
.info-card {
  padding: 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.page-intro {
  display: grid;
  gap: 1rem;
}

.intro-actions {
  display: flex;
  justify-content: flex-start;
}

.intro-copy {
  display: grid;
  gap: 0.5rem;
}

.eyebrow,
.section-kicker {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

h1,
.info-card h2 {
  margin: 0;
  letter-spacing: -0.04em;
  color: #0f172a;
}

h1 {
  font-size: clamp(1.8rem, 3.2vw, 2.8rem);
  line-height: 1.08;
}

.intro-copy p,
.info-card p,
.state-list dd {
  margin: 0;
  color: #475569;
  line-height: 1.6;
}

.page-links {
  display: grid;
  gap: 0.75rem;
}

.page-link {
  display: grid;
  gap: 0.2rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.95);
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.new-task-button {
  min-height: 2.75rem;
  padding: 0.8rem 1rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: linear-gradient(135deg, #7c3aed, #4f46e5);
  color: #ffffff;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    filter 160ms ease;
}

.new-task-button:hover,
.new-task-button:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 12px 30px rgba(79, 70, 229, 0.24);
  filter: saturate(1.05);
}

.new-task-button:focus-visible {
  outline: 2px solid rgba(124, 58, 237, 0.2);
  outline-offset: 2px;
}

.page-link:hover,
.page-link:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(124, 58, 237, 0.24);
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.page-link span,
.info-card h2 {
  color: #0f172a;
  font-weight: 700;
}

.page-link small {
  color: #64748b;
}

.board-notes {
  display: grid;
  gap: 1rem;
}

.state-list,
.check-list {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
}

.state-list div {
  padding: 0.9rem 1rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.95);
}

.state-list dt {
  margin: 0 0 0.2rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

.check-list li {
  position: relative;
  padding-left: 1.25rem;
  color: #0f172a;
}

.check-list li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.55rem;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 999px;
  background: #7c3aed;
}

@media (min-width: 768px) {
  .page-intro,
  .info-card {
    padding: 1.5rem;
  }

  .page-intro {
    grid-template-columns: minmax(0, 1.2fr) minmax(18rem, 0.8fr);
    align-items: start;
  }

  .intro-actions {
    justify-content: flex-end;
    align-items: start;
  }

  .page-links {
    grid-column: 1 / -1;
  }

  .board-notes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
