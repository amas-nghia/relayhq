<script setup lang="ts">
import { computed, ref } from "vue";
import EmptyState from "../../components/EmptyState.vue";
import ApprovalPanel from "../../components/approvals/ApprovalPanel.vue";
import TaskDetailDrawer from "../../components/tasks/TaskDetailDrawer.vue";
import { buildColumnMovePatch, getAdjacentTaskColumns } from "../../data/task-actions";
import TaskStatusTimeline from "../../components/tasks/TaskStatusTimeline.vue";
import { selectTaskWorkflow } from "../../data/task-workflow";
import { emptyVaultReadModel, loadVaultReadModel, relayhqReadModelKey, selectWorkspaceLinks } from "../../data/relayhq-overview";

const route = useRoute();

const taskId = computed(() => {
  const value = route.params.task;
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
});

const { data: vault } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
});

const task = computed(() => selectTaskWorkflow(vault.value, taskId.value));
const workspaceLinks = computed(() => selectWorkspaceLinks(vault.value));
const hasTaskData = computed(() => vault.value.tasks.some((entry) => entry.id === taskId.value));
const adjacentColumns = computed(() => task.value.column === "unavailable" ? { previous: null, next: null } : getAdjacentTaskColumns(task.value.column));
const columnMoveState = ref<"previous" | "next" | null>(null);
const columnMoveError = ref<string | null>(null);

const taskActorId = computed(() => task.value.lockedBy ?? task.value.createdBy ?? task.value.assignee);

function readErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    if ("data" in error && typeof (error as { readonly data?: { readonly statusMessage?: string } }).data?.statusMessage === "string") {
      return (error as { readonly data: { readonly statusMessage: string } }).data.statusMessage;
    }

    if ("statusMessage" in error && typeof (error as { readonly statusMessage?: string }).statusMessage === "string") {
      return (error as { readonly statusMessage: string }).statusMessage;
    }
  }

  return error instanceof Error ? error.message : "RelayHQ could not move this task right now.";
}

async function moveTaskToColumn(direction: "previous" | "next"): Promise<void> {
  const targetColumn = adjacentColumns.value[direction];

  if (targetColumn === null) {
    return;
  }

  columnMoveState.value = direction;
  columnMoveError.value = null;

  try {
    await $fetch(`/api/vault/tasks/${task.value.id}`, {
      method: "PATCH",
      body: {
        actorId: taskActorId.value,
        patch: buildColumnMovePatch(targetColumn.value),
      },
    });

    await refreshNuxtData(relayhqReadModelKey);
  } catch (error: unknown) {
    columnMoveError.value = readErrorMessage(error);
  } finally {
    columnMoveState.value = null;
  }
}
</script>

<template>
  <div class="task-page">
    <EmptyState
      v-if="!hasTaskData"
      title="No task data found"
      description="This task route is not backed by a shared task record yet. Seed vault/shared/tasks and linked approval files to populate the workflow view."
      action-label="Open approvals queue"
      action-href="/approvals"
    />

    <template v-else>
    <section class="page-intro" aria-labelledby="task-page-title">
      <div class="intro-copy">
        <p class="eyebrow">Task workflow</p>
        <h1 id="task-page-title">{{ task.title }}</h1>
        <p>
          This page mirrors the vault-backed task record, its approval gate, and its coordination
          history without surfacing runtime execution details.
        </p>
      </div>

      <div class="intro-aside" aria-label="Task summary">
        <span class="status-pill" :data-state="task.status">{{ task.status }}</span>
        <dl class="intro-metrics" aria-label="Task metrics">
          <div v-for="metric in task.metrics" :key="metric.label" class="metric-chip">
            <dt>{{ metric.label }}</dt>
            <dd>
              <strong>{{ metric.value }}</strong>
              <span>{{ metric.note }}</span>
            </dd>
          </div>
        </dl>

        <div class="column-move-card" aria-labelledby="column-move-heading">
          <div class="column-move-copy">
            <p class="section-kicker">Task transitions</p>
            <h2 id="column-move-heading">Move between adjacent columns</h2>
            <p>
              These controls use the existing task lifecycle update route and reload the vault-backed
              task state after each move.
            </p>
          </div>

          <div class="column-move-actions" role="group" aria-label="Move task to adjacent columns">
            <button
              v-if="adjacentColumns.previous"
              type="button"
              class="move-button"
              :disabled="columnMoveState !== null"
              @click="moveTaskToColumn('previous')"
            >
              {{ columnMoveState === 'previous' ? 'Moving…' : `Move to ${adjacentColumns.previous.label}` }}
            </button>
            <button
              v-if="adjacentColumns.next"
              type="button"
              class="move-button move-button-primary"
              :disabled="columnMoveState !== null"
              @click="moveTaskToColumn('next')"
            >
              {{ columnMoveState === 'next' ? 'Moving…' : `Move to ${adjacentColumns.next.label}` }}
            </button>
          </div>

          <p v-if="columnMoveError" class="column-move-error" role="alert">{{ columnMoveError }}</p>
        </div>
      </div>
    </section>

    <section class="task-layout" aria-label="Task control-plane views">
      <div class="drawer-slot">
        <TaskDetailDrawer :task="task" />
      </div>

      <div class="workflow-stack">
        <ApprovalPanel :task="task" />
        <TaskStatusTimeline :task="task" />
      </div>
    </section>

    <section class="page-links" aria-label="Related views">
      <NuxtLink v-for="link in workspaceLinks" :key="link.href" class="page-link" :to="link.href">
        <span>{{ link.label }}</span>
        <small>{{ link.note }}</small>
      </NuxtLink>
    </section>

    <section class="boundary-card" aria-labelledby="boundary-heading">
      <p class="section-kicker">Boundary</p>
      <h2 id="boundary-heading">Control plane only</h2>
      <p>
        Execution logs, heartbeat details, and tool output remain outside this view so the vault
        stays the source of truth for coordination state.
      </p>
    </section>
    </template>
  </div>
</template>

<style scoped>
.task-page {
  display: grid;
  gap: 1rem;
}

.page-intro,
.boundary-card {
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

.intro-copy {
  display: grid;
  gap: 0.5rem;
}

.eyebrow,
.section-kicker,
.metric-chip dt {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

h1,
.boundary-card h2 {
  margin: 0;
  letter-spacing: -0.04em;
  color: #0f172a;
}

h1 {
  font-size: clamp(1.8rem, 3.2vw, 2.8rem);
  line-height: 1.08;
}

.intro-copy p,
.boundary-card p,
.metric-chip dd {
  margin: 0;
  color: #475569;
  line-height: 1.6;
}

.intro-aside {
  display: grid;
  gap: 0.75rem;
}

.column-move-card {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.95);
}

.column-move-copy {
  display: grid;
  gap: 0.35rem;
}

.column-move-copy h2,
.column-move-copy p {
  margin: 0;
}

.column-move-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.move-button {
  min-height: 2.5rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.9rem;
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.move-button:hover,
.move-button:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(124, 58, 237, 0.24);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.move-button-primary {
  border-color: rgba(124, 58, 237, 0.18);
  background: rgba(124, 58, 237, 0.08);
  color: #4c1d95;
}

.move-button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.column-move-error {
  margin: 0;
  color: #991b1b;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 2.5rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid rgba(124, 58, 237, 0.18);
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.08);
  color: #4c1d95;
  font-size: 0.875rem;
  font-weight: 700;
}

.status-pill[data-state="waiting-approval"] {
  border-color: rgba(245, 158, 11, 0.2);
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
}

.status-pill[data-state="in-progress"] {
  border-color: rgba(59, 130, 246, 0.18);
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
}

.status-pill[data-state="todo"] {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(248, 250, 252, 0.95);
  color: #334155;
}

.intro-metrics,
.page-links,
.workflow-stack {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
}

.metric-chip,
.page-link,
.boundary-card {
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.95);
}

.metric-chip {
  display: grid;
  gap: 0.15rem;
  padding: 0.9rem 1rem;
}

.metric-chip dd strong {
  display: block;
  color: #0f172a;
  font-size: 1.25rem;
}

.drawer-slot,
.workflow-stack {
  min-width: 0;
}

.workflow-stack {
  align-content: start;
}

.page-links {
  grid-template-columns: 1fr;
}

.page-link {
  display: grid;
  gap: 0.2rem;
  padding: 0.9rem 1rem;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.page-link:hover,
.page-link:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(124, 58, 237, 0.24);
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.page-link span {
  color: #0f172a;
  font-weight: 700;
}

.page-link small {
  color: #64748b;
}

.boundary-card {
  display: grid;
  gap: 0.75rem;
}

@media (min-width: 768px) {
  .page-intro,
  .boundary-card {
    padding: 1.5rem;
  }

  .page-intro {
    grid-template-columns: minmax(0, 1.2fr) minmax(20rem, 0.8fr);
    align-items: start;
  }

  .intro-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .page-links {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .task-layout {
    display: grid;
    grid-template-columns: minmax(20rem, 0.9fr) minmax(0, 1.1fr);
    gap: 1rem;
    align-items: start;
  }

  .drawer-slot {
    position: sticky;
    top: 1.5rem;
    align-self: start;
  }
}
</style>
