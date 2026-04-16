<script setup lang="ts">
import { computed } from "vue";
import EmptyState from "../components/EmptyState.vue";
import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
  selectBoardSummary,
  selectPendingApprovals,
  selectProjectSummary,
  selectWorkspaceLinks,
  selectWorkspaceOverview,
} from "../data/relayhq-overview";

const { data: vault } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
});

const workspace = computed(() => selectWorkspaceOverview(vault.value));
const project = computed(() => selectProjectSummary(vault.value, workspace.value.projectId));
const board = computed(() => selectBoardSummary(vault.value, workspace.value.boardId));
const workspaceLinks = computed(() => selectWorkspaceLinks(vault.value));
const pendingApprovals = computed(() => selectPendingApprovals(vault.value));
const hasWorkspaceData = computed(() => vault.value.workspaces.length > 0);

const dashboardMetrics = computed(() => workspace.value.metrics);

const primaryBoardHref = computed(() => `/boards/${board.value.id}`);
const projectHref = computed(() => `/projects/${project.value.id}`);

const boardFlowSteps = computed(() => {
  if (board.value.columns.length > 0) {
    return board.value.columns.map((column) => ({
      id: column.id,
      title: column.title,
      detail: `${column.taskCount} ${column.taskCount === 1 ? "task" : "tasks"}`,
    }));
  }

  return board.value.workflow.map((step, index) => ({
    id: `workflow-${index}`,
    title: step.title,
    detail: step.detail,
  }));
});

const quickLinks = computed(() =>
  workspaceLinks.value.filter((link) => link.href !== primaryBoardHref.value),
);
</script>

<template>
  <div class="page-shell">
    <EmptyState
      v-if="!hasWorkspaceData"
      title="No vault data found"
      description="Add shared workspace, project, board, and task records under vault/shared to populate the dashboard."
      action-label="View agent registry"
      action-href="/agents"
    />

    <template v-else>
      <section id="workspace" class="hero-card" aria-labelledby="workspace-heading">
        <div class="hero-copy">
          <p class="eyebrow">Operational dashboard</p>
          <h1 id="workspace-heading" class="hero-title">
            {{ workspace.name }}
          </h1>
          <p class="hero-text">
            {{ workspace.summary }}
          </p>

          <div class="hero-actions" aria-label="Primary actions">
            <NuxtLink class="primary-action" :to="primaryBoardHref">
              Open Board
            </NuxtLink>
            <NuxtLink class="secondary-action" :to="projectHref">
              View Project
            </NuxtLink>
            <NuxtLink class="secondary-action" to="/approvals">
              Review Approvals
              <span v-if="pendingApprovals.length > 0" class="action-badge">{{ pendingApprovals.length }}</span>
            </NuxtLink>
          </div>
        </div>

        <aside class="hero-panel" aria-label="Current workspace state">
          <div class="hero-panel-card">
            <span class="panel-label">Active board</span>
            <strong>{{ board.name }}</strong>
            <p>{{ board.summary }}</p>
          </div>

          <div class="hero-panel-card">
            <span class="panel-label">Source of truth</span>
            <strong>{{ workspace.sourcePath }}</strong>
            <p>Shared vault files remain the canonical coordination record for every visible count and workflow state.</p>
          </div>
        </aside>
      </section>

      <section class="metrics-grid" aria-label="Workspace metrics">
        <article v-for="metric in dashboardMetrics" :key="metric.label" class="metric-card">
          <p class="metric-label">{{ metric.label }}</p>
          <strong class="metric-value">{{ metric.value }}</strong>
          <p class="metric-note">{{ metric.note }}</p>
        </article>
      </section>

      <section
        v-if="pendingApprovals.length > 0"
        class="pending-callout"
        aria-labelledby="pending-approvals-heading"
      >
        <div class="pending-copy">
          <p class="eyebrow eyebrow-amber">Needs review</p>
          <h2 id="pending-approvals-heading">{{ pendingApprovals.length }} pending approvals</h2>
          <p>
            Human sign-off is blocking work on one or more vault-backed tasks. Review the queue to unblock delivery.
          </p>
        </div>

        <NuxtLink class="pending-action" to="/approvals">
          Open approvals queue
        </NuxtLink>
      </section>

      <section id="board" class="section-card" aria-labelledby="board-heading">
        <div class="section-heading section-heading-inline">
          <div>
            <p class="eyebrow">Board flow</p>
            <h2 id="board-heading">Operational movement across {{ board.name }}</h2>
          </div>

          <NuxtLink class="inline-link" :to="primaryBoardHref">
            Open board
          </NuxtLink>
        </div>

        <div class="flow-track" role="list" aria-label="Board columns">
          <div v-for="step in boardFlowSteps" :key="step.id" class="flow-step" role="listitem">
            <span class="flow-dot" aria-hidden="true" />
            <strong>{{ step.title }}</strong>
            <p>{{ step.detail }}</p>
          </div>
        </div>
      </section>

      <section class="section-card" aria-labelledby="views-heading">
        <div class="section-heading">
          <p class="eyebrow">Live views</p>
          <h2 id="views-heading">Jump into the active coordination surfaces</h2>
        </div>

        <nav class="page-links" aria-label="Primary views">
          <NuxtLink v-for="link in quickLinks" :key="link.href" class="page-link" :to="link.href">
            <span>{{ link.label }}</span>
            <small>{{ link.note }}</small>
          </NuxtLink>
        </nav>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page-shell {
  display: grid;
  gap: 1rem;
}

.hero-card,
.section-card,
.metric-card,
.pending-callout {
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.hero-card {
  display: grid;
  gap: 1.25rem;
  padding: 1.25rem;
}

.hero-copy {
  display: grid;
  gap: 0.75rem;
}

.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #6d28d9;
}

.eyebrow-amber {
  color: #92400e;
}

.hero-title,
.section-heading h2,
.pending-copy h2 {
  margin: 0;
  letter-spacing: -0.04em;
}

.hero-title {
  font-size: clamp(2rem, 4vw, 3.5rem);
  line-height: 1.02;
  max-width: 14ch;
}

.hero-text,
.hero-panel-card p,
.metric-note,
.pending-copy p,
.flow-step p {
  margin: 0;
  color: #475569;
  line-height: 1.65;
}

.hero-actions,
.hero-panel,
.metrics-grid,
.page-links,
.flow-track {
  display: grid;
  gap: 0.75rem;
}

.hero-panel-card,
.flow-step,
.page-link {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.92);
}

.panel-label,
.metric-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

.hero-panel-card strong,
.metric-value,
.flow-step strong,
.page-link span,
.secondary-action,
.inline-link,
.pending-action {
  color: #0f172a;
}

.hero-panel-card strong,
.metric-value,
.pending-copy h2 {
  letter-spacing: -0.04em;
}

.hero-actions {
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
}

.primary-action,
.secondary-action,
.pending-action,
.inline-link,
.page-link {
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.primary-action,
.secondary-action,
.pending-action,
.inline-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  min-height: 3rem;
  padding: 0.85rem 1rem;
  border-radius: 1rem;
  font-weight: 700;
  text-decoration: none;
}

.primary-action {
  border: 1px solid rgba(124, 58, 237, 0.28);
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.96), rgba(109, 40, 217, 0.9));
  color: #ffffff;
  box-shadow: 0 18px 38px rgba(109, 40, 217, 0.18);
}

.secondary-action,
.inline-link {
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: rgba(248, 250, 252, 0.95);
}

.primary-action:hover,
.primary-action:focus-visible,
.secondary-action:hover,
.secondary-action:focus-visible,
.pending-action:hover,
.pending-action:focus-visible,
.inline-link:hover,
.inline-link:focus-visible,
.page-link:hover,
.page-link:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(124, 58, 237, 0.24);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.secondary-action:hover,
.secondary-action:focus-visible,
.inline-link:hover,
.inline-link:focus-visible,
.page-link:hover,
.page-link:focus-visible {
  background: #ffffff;
}

.action-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  min-height: 1.6rem;
  padding: 0 0.45rem;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.14);
  color: #92400e;
  font-size: 0.75rem;
}

.section-card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
}

.section-heading {
  display: grid;
  gap: 0.45rem;
}

.section-heading h2,
.pending-copy h2 {
  font-size: clamp(1.25rem, 2vw, 1.75rem);
  line-height: 1.15;
}

.section-heading-inline {
  align-items: start;
}

.metrics-grid {
  grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
}

.metric-card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
}

.metric-value {
  font-size: clamp(1.9rem, 3vw, 2.6rem);
  line-height: 1;
}

.flow-step {
  display: grid;
  gap: 0.35rem;
  position: relative;
  overflow: hidden;
}

.flow-dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 999px;
  background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  box-shadow: 0 0 0 0.35rem rgba(124, 58, 237, 0.1);
}

.pending-callout {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border-color: rgba(245, 158, 11, 0.24);
  background: linear-gradient(180deg, rgba(255, 251, 235, 0.98), rgba(255, 255, 255, 0.94));
}

.pending-action {
  border: 1px solid rgba(245, 158, 11, 0.22);
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
}

.page-link {
  gap: 0.2rem;
}

.page-link small {
  color: #64748b;
}

@media (min-width: 768px) {
  .hero-card,
  .pending-callout,
  .section-card {
    padding: 1.5rem;
  }

  .hero-card {
    grid-template-columns: minmax(0, 1.45fr) minmax(18rem, 0.95fr);
    align-items: start;
  }

  .hero-panel {
    align-self: stretch;
  }

  .section-heading-inline,
  .pending-callout {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .flow-track,
  .page-links {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .flow-track {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .page-links {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
