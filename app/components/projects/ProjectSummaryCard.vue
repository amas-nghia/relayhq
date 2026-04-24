<script setup lang="ts">
import type { OverviewLink, OverviewMetric, OverviewWorkflowStep } from "../../data/relayhq-overview";

defineProps<{
  readonly title: string;
  readonly id: string;
  readonly workspaceName: string;
  readonly workspaceId: string;
  readonly boardName: string;
  readonly boardId: string;
  readonly status: string;
  readonly sourcePath: string;
  readonly summary: string;
  readonly metrics: ReadonlyArray<OverviewMetric>;
  readonly workflow: ReadonlyArray<OverviewWorkflowStep>;
  readonly links: ReadonlyArray<OverviewLink>;
}>();
</script>

<template>
  <article class="summary-card" aria-labelledby="project-summary-title">
    <header class="summary-header">
      <div class="summary-copy">
        <p class="eyebrow">Project summary</p>
        <h2 id="project-summary-title" class="summary-title">{{ title }}</h2>
        <p class="summary-text">{{ summary }}</p>
      </div>

      <div class="summary-status" aria-label="Project state">
        <span class="status-pill">{{ status }}</span>
        <dl class="identity-list">
          <div>
            <dt>Workspace</dt>
            <dd>{{ workspaceName }}</dd>
          </div>
          <div>
            <dt>Board</dt>
            <dd>{{ boardName }}</dd>
          </div>
        </dl>
      </div>
    </header>

    <section class="metric-grid" aria-label="Project metrics">
      <article v-for="metric in metrics" :key="metric.label" class="metric-card">
        <p class="metric-label">{{ metric.label }}</p>
        <strong class="metric-value">{{ metric.value }}</strong>
        <p class="metric-note">{{ metric.note }}</p>
      </article>
    </section>

    <section class="summary-layout">
      <article class="detail-panel" aria-labelledby="vault-record-heading">
        <h3 id="vault-record-heading">Vault record</h3>
        <dl class="detail-list">
          <div>
            <dt>Project id</dt>
            <dd>{{ id }}</dd>
          </div>
          <div>
            <dt>Workspace id</dt>
            <dd>{{ workspaceId }}</dd>
          </div>
          <div>
            <dt>Board id</dt>
            <dd>{{ boardId }}</dd>
          </div>
          <div>
            <dt>Source file</dt>
            <dd>{{ sourcePath }}</dd>
          </div>
        </dl>
      </article>

      <article class="detail-panel" aria-labelledby="workflow-heading">
        <h3 id="workflow-heading">Control-plane workflow</h3>
        <ol class="workflow-list" role="list">
          <li v-for="step in workflow" :key="step.title">
            <strong>{{ step.title }}</strong>
            <p>{{ step.detail }}</p>
          </li>
        </ol>
      </article>
    </section>

    <footer class="summary-footer">
      <nav aria-label="Project navigation" class="summary-links">
        <NuxtLink v-for="link in links" :key="link.href" class="summary-link" :to="link.href">
          <span>{{ link.label }}</span>
          <small>{{ link.note }}</small>
        </NuxtLink>
      </nav>
    </footer>
  </article>
</template>

<style scoped>
.summary-card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid rgba(51, 65, 85, 0.8);
  border-radius: 1.25rem;
  background: rgba(15, 23, 42, 0.88);
  box-shadow: 0 24px 72px rgba(0, 0, 0, 0.35);
}

.summary-header,
.summary-layout {
  display: grid;
  gap: 1rem;
}

.summary-copy {
  display: grid;
  gap: 0.5rem;
}

.eyebrow,
.metric-label {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #34d399;
}

.summary-title,
.detail-panel h3 {
  margin: 0;
  letter-spacing: -0.04em;
  color: #f8fafc;
}

.summary-title {
  font-size: clamp(1.6rem, 3vw, 2.4rem);
  line-height: 1.08;
}

.summary-text,
.metric-note,
.detail-panel p,
.detail-list dd,
.identity-list dd,
.summary-link small {
  margin: 0;
  color: #94a3b8;
  line-height: 1.55;
}

.summary-status {
  display: grid;
  gap: 0.75rem;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 2.5rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid rgba(52, 211, 153, 0.24);
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.12);
  color: #6ee7b7;
  font-size: 0.875rem;
  font-weight: 700;
}

.identity-list,
.detail-list,
.workflow-list,
.summary-links {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
}

.identity-list div,
.detail-list div,
.workflow-list li,
.summary-link {
  border: 1px solid rgba(51, 65, 85, 0.9);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.76);
}

.identity-list div,
.detail-list div,
.workflow-list li {
  padding: 0.9rem 1rem;
}

.identity-list dt,
.detail-list dt {
  margin: 0 0 0.2rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

.metric-grid {
  display: grid;
  gap: 0.75rem;
}

.metric-card {
  padding: 1rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.95);
}

.metric-value {
  display: block;
  margin: 0.2rem 0 0.3rem;
  font-size: 1.5rem;
  line-height: 1;
  color: #f8fafc;
}

.detail-panel {
  display: grid;
  gap: 0.75rem;
}

.workflow-list li {
  display: grid;
  gap: 0.25rem;
}

.workflow-list strong,
.summary-link span {
  color: #0f172a;
  font-weight: 700;
}

.summary-links {
  grid-template-columns: 1fr;
}

.summary-link {
  display: grid;
  gap: 0.2rem;
  padding: 0.9rem 1rem;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.summary-link:hover,
.summary-link:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(124, 58, 237, 0.24);
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

@media (min-width: 768px) {
  .summary-card {
    padding: 1.5rem;
  }

  .summary-header {
    grid-template-columns: minmax(0, 1.3fr) minmax(20rem, 0.9fr);
    align-items: start;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-layout {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-links {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .metric-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
