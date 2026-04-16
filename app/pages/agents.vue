<script setup lang="ts">
import { computed } from "vue";
import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
  selectAgentRegistry,
  selectWorkspaceLinks,
  selectWorkspaceOverview,
} from "../data/relayhq-overview";

const { data: vault } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
});

const agents = computed(() => selectAgentRegistry(vault.value));
const workspace = computed(() => selectWorkspaceOverview(vault.value));
const workspaceLinks = computed(() => selectWorkspaceLinks(vault.value));
</script>

<template>
  <div class="agents-page">
    <section class="page-intro" aria-labelledby="agents-page-title">
      <div class="intro-copy">
        <p class="eyebrow">Agent registry</p>
        <h1 id="agents-page-title">Vault-backed assignees for {{ workspace.name }}</h1>
        <p>
          RelayHQ keeps the assignment surface explicit: each agent record comes from
          <code>vault/shared/agents</code> and stays limited to coordination metadata.
        </p>
      </div>

      <div class="intro-aside" aria-label="Registry summary">
        <div class="metric-chip">
          <span>Total agents</span>
          <strong>{{ agents.length }}</strong>
        </div>
        <div class="metric-chip">
          <span>Ready now</span>
          <strong>{{ agents.filter((agent) => agent.status === "available").length }}</strong>
        </div>
      </div>
    </section>

    <section v-if="agents.length > 0" class="registry-grid" aria-label="Agent registry list">
      <article v-for="agent in agents" :key="agent.id" class="agent-card">
        <div class="agent-header">
          <div>
            <p class="agent-kicker">{{ agent.id }}</p>
            <h2>{{ agent.name }}</h2>
            <p class="agent-copy">{{ agent.role }}</p>
          </div>

          <span class="status-pill" :data-state="agent.status">{{ agent.status }}</span>
        </div>

        <p class="availability-note">{{ agent.availabilityLabel }}</p>

        <dl class="meta-grid">
          <div>
            <dt>Provider</dt>
            <dd>{{ agent.provider }}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{{ agent.model }}</dd>
          </div>
          <div>
            <dt>Skill file</dt>
            <dd>{{ agent.skillFile }}</dd>
          </div>
          <div>
            <dt>Vault record</dt>
            <dd>{{ agent.sourcePath }}</dd>
          </div>
        </dl>

        <div class="chip-section">
          <h3>Capabilities</h3>
          <ul class="chip-list" role="list">
            <li v-for="capability in agent.capabilities" :key="capability" class="chip">{{ capability }}</li>
          </ul>
        </div>

        <div class="chip-section">
          <h3>Assignment-ready task types</h3>
          <ul class="chip-list" role="list">
            <li v-for="taskType in agent.taskTypesAccepted" :key="taskType" class="chip chip-accent">{{ taskType }}</li>
          </ul>
        </div>

        <div class="stack-grid">
          <div class="chip-section">
            <h3>Approval needed for</h3>
            <ul class="chip-list" role="list">
              <li v-for="policy in agent.approvalRequiredFor" :key="policy" class="chip chip-warning">{{ policy }}</li>
            </ul>
          </div>

          <div class="chip-section">
            <h3>Out of bounds</h3>
            <ul class="chip-list" role="list">
              <li v-for="restriction in agent.cannotDo" :key="restriction" class="chip chip-muted">{{ restriction }}</li>
            </ul>
          </div>
        </div>
      </article>
    </section>

    <section v-else class="empty-card" aria-labelledby="agents-empty-title">
      <p class="eyebrow">No registry data yet</p>
      <h2 id="agents-empty-title">No agents have been registered in the shared vault</h2>
      <p>
        Add Markdown records under <code>vault/shared/agents</code> to make assignees visible here
        before wiring task assignment from the UI.
      </p>
    </section>

    <section class="page-links" aria-label="Related views">
      <NuxtLink v-for="link in workspaceLinks" :key="link.href" class="page-link" :to="link.href">
        <span>{{ link.label }}</span>
        <small>{{ link.note }}</small>
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.agents-page {
  display: grid;
  gap: 1rem;
}

.page-intro,
.agent-card,
.empty-card {
  padding: 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.page-intro,
.agent-card,
.empty-card,
.intro-copy,
.intro-aside,
.registry-grid,
.meta-grid,
.chip-section,
.stack-grid,
.chip-list,
.page-links {
  display: grid;
  gap: 0.75rem;
}

.eyebrow,
.agent-kicker,
.meta-grid dt,
.metric-chip span,
.chip-section h3 {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

h1,
h2,
.chip-section h3 {
  letter-spacing: -0.04em;
  color: #0f172a;
}

h1,
h2,
.chip-section h3,
.agent-copy,
.availability-note,
.empty-card p,
.meta-grid dd,
.page-link small,
.page-intro p {
  margin: 0;
}

h1 {
  font-size: clamp(1.8rem, 3.2vw, 2.8rem);
  line-height: 1.08;
}

.page-intro p,
.agent-copy,
.availability-note,
.empty-card p,
.meta-grid dd {
  color: #475569;
  line-height: 1.6;
}

.intro-aside,
.metric-chip,
.meta-grid div,
.page-link {
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.95);
}

.intro-aside {
  padding: 0.25rem;
}

.metric-chip,
.meta-grid div,
.page-link {
  padding: 0.9rem 1rem;
}

.metric-chip strong {
  color: #0f172a;
  font-size: 1.75rem;
}

.registry-grid {
  grid-template-columns: 1fr;
}

.agent-header {
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;
  align-items: start;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 2rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid rgba(124, 58, 237, 0.18);
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.08);
  color: #4c1d95;
  font-size: 0.8125rem;
  font-weight: 700;
}

.status-pill[data-state="available"] {
  border-color: rgba(16, 185, 129, 0.2);
  background: rgba(16, 185, 129, 0.12);
  color: #065f46;
}

.status-pill[data-state="busy"] {
  border-color: rgba(59, 130, 246, 0.18);
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
}

.status-pill[data-state="offline"] {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(248, 250, 252, 0.95);
  color: #334155;
}

.meta-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.chip-list {
  grid-template-columns: repeat(auto-fit, minmax(10rem, max-content));
  margin: 0;
  padding: 0;
}

.chip {
  padding: 0.55rem 0.75rem;
  border: 1px solid rgba(124, 58, 237, 0.16);
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.08);
  color: #4c1d95;
  font-size: 0.875rem;
  font-weight: 600;
}

.chip-accent {
  border-color: rgba(59, 130, 246, 0.16);
  background: rgba(59, 130, 246, 0.1);
  color: #1d4ed8;
}

.chip-warning {
  border-color: rgba(245, 158, 11, 0.2);
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
}

.chip-muted {
  border-color: rgba(148, 163, 184, 0.22);
  background: rgba(248, 250, 252, 0.95);
  color: #334155;
}

.page-links {
  grid-template-columns: 1fr;
}

.page-link {
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

@media (min-width: 768px) {
  .page-intro,
  .agent-card,
  .empty-card {
    padding: 1.5rem;
  }

  .page-intro {
    grid-template-columns: minmax(0, 1.2fr) minmax(16rem, 0.8fr);
    align-items: start;
  }

  .intro-aside,
  .page-links {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .registry-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stack-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
