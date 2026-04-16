<script setup lang="ts">
import { computed } from "vue";
import ProjectSummaryCard from "../../components/projects/ProjectSummaryCard.vue";
import TaskCreateForm from "../../components/tasks/TaskCreateForm.vue";
import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
  selectProjectSummary,
  selectWorkspaceLinks,
} from "../../data/relayhq-overview";

const route = useRoute();

const projectId = computed(() => {
  const value = route.params.project;
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
});

const { data: vault } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
});

const project = computed(() => selectProjectSummary(vault.value, projectId.value));
const workspaceLinks = computed(() => selectWorkspaceLinks(vault.value));

const projectBoards = computed(() =>
  vault.value.boards
    .filter((entry) => entry.projectId === projectId.value)
    .map((entry) => ({ id: entry.id, name: entry.name }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
);

const projectColumns = computed(() =>
  vault.value.columns
    .filter((entry) => entry.projectId === projectId.value)
    .map((entry) => ({ id: entry.id, name: entry.name, boardId: entry.boardId, position: entry.position }))
    .sort((left, right) => left.position - right.position || left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .map(({ position: _position, ...column }) => column),
);

const assigneeOptions = computed(() => {
  const values = new Set<string>();

  for (const agent of vault.value.agents) {
    if (agent.workspaceId === project.value.workspaceId) {
      values.add(agent.id);
    }
  }

  for (const task of vault.value.tasks) {
    if (task.projectId === projectId.value) {
      values.add(task.assignee);
    }
  }

  return [...values].sort((left, right) => left.localeCompare(right));
});

async function handleTaskCreated(): Promise<void> {
  await refreshNuxtData(relayhqReadModelKey);
}
</script>

<template>
  <div class="project-page">
    <section class="page-intro" aria-labelledby="project-page-title">
      <div class="intro-copy">
        <p class="eyebrow">Project overview</p>
        <h1 id="project-page-title">{{ project.name }}</h1>
        <p>
          This view reflects the vault-backed project record and the control-plane workflow around it.
        </p>
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
      :project-id="project.id"
      :project-name="project.name"
      :boards="projectBoards"
      :columns="projectColumns"
      :assignees="assigneeOptions"
      @created="handleTaskCreated"
    />

    <section class="project-grid" aria-label="Project supporting information">
      <article class="info-card">
        <p class="section-kicker">Workspace state</p>
        <h2>{{ project.workspaceName }}</h2>
        <p>
          Shared vault files hold the canonical coordination record. Private overlays stay out of the
          shared history.
        </p>
        <dl class="state-list">
          <div>
            <dt>Workspace id</dt>
            <dd>{{ project.workspaceId }}</dd>
          </div>
          <div>
            <dt>Workspace status</dt>
            <dd>Control plane only</dd>
          </div>
        </dl>
      </article>

      <article class="info-card">
        <p class="section-kicker">Control-plane boundary</p>
        <h2>What this page shows</h2>
        <ul class="check-list" role="list">
          <li>Vault file identity and board linkage</li>
          <li>Visible coordination metrics and workflow checkpoints</li>
          <li>Links that stay inside project and board navigation</li>
          <li>No runtime execution controls or hidden task runner</li>
        </ul>
      </article>
    </section>
  </div>
</template>

<style scoped>
.project-page {
  display: grid;
  gap: 1rem;
}

.page-intro {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
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

.project-grid {
  display: grid;
  gap: 1rem;
}

.info-card {
  display: grid;
  gap: 0.75rem;
  padding: 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
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

  .project-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
