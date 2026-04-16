<script setup lang="ts">
import { computed } from "vue";
import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
  selectAuditNotes,
  selectWorkspaceLinks,
  selectWorkspaceOverview,
} from "../data/relayhq-overview";

const { data: vault } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
});

const workspace = computed(() => selectWorkspaceOverview(vault.value));
const auditNotes = computed(() => selectAuditNotes(vault.value));
const workspaceLinks = computed(() => selectWorkspaceLinks(vault.value));
</script>

<template>
  <div class="audit-page">
    <section class="page-intro" aria-labelledby="audit-page-title">
      <div class="intro-copy">
        <p class="eyebrow">Audit history</p>
        <h1 id="audit-page-title">Shared audit notes for {{ workspace.name }}</h1>
        <p>
          Review the canonical audit trail captured in the shared vault, including note source, confidence,
          and the linked task record.
        </p>
      </div>

      <div class="summary-card">
        <span class="summary-label">Audit notes</span>
        <strong>{{ auditNotes.length }}</strong>
      </div>
    </section>

    <section v-if="auditNotes.length > 0" class="audit-list" aria-label="Shared audit notes list">
      <NuxtLink v-for="auditNote in auditNotes" :key="auditNote.id" class="audit-row" :to="`/tasks/${auditNote.taskId}`">
        <div class="audit-main">
          <p class="audit-id">{{ auditNote.id }}</p>
          <h2>{{ auditNote.message }}</h2>
        </div>

        <dl class="audit-meta">
          <div>
            <dt>Source</dt>
            <dd>{{ auditNote.source }}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{{ Math.round(auditNote.confidence * 100) }}%</dd>
          </div>
          <div>
            <dt>Created at</dt>
            <dd>{{ auditNote.createdAt }}</dd>
          </div>
          <div>
            <dt>Task</dt>
            <dd>{{ auditNote.taskId }}</dd>
          </div>
        </dl>
      </NuxtLink>
    </section>

    <section v-else class="empty-card" aria-labelledby="audit-empty-title">
      <p class="eyebrow">No audit notes</p>
      <h2 id="audit-empty-title">No audit notes recorded yet</h2>
      <p>Add canonical audit-note records under the shared vault to make the coordination trail visible here.</p>
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
.audit-page {
  display: grid;
  gap: 1rem;
}

.page-intro,
.summary-card,
.audit-row,
.empty-card {
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.page-intro,
.audit-row,
.audit-main,
.audit-meta,
.page-links,
.audit-list,
.intro-copy,
.empty-card {
  display: grid;
  gap: 0.75rem;
}

.page-intro,
.audit-row,
.empty-card {
  padding: 1.25rem;
}

.page-intro {
  align-items: start;
}

.eyebrow,
.summary-label,
.audit-id,
.audit-meta dt {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

h1,
h2,
.summary-card strong,
.page-link span {
  margin: 0;
  color: #0f172a;
  letter-spacing: -0.04em;
}

h1 {
  font-size: clamp(1.8rem, 3.2vw, 2.8rem);
  line-height: 1.08;
}

.intro-copy p,
.audit-meta dd,
.empty-card p,
.page-link small {
  margin: 0;
  color: #475569;
  line-height: 1.6;
}

.summary-card {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  background: rgba(14, 165, 233, 0.08);
}

.summary-card strong {
  font-size: 2rem;
  color: #0f766e;
}

.audit-row {
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.audit-row:hover,
.audit-row:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(124, 58, 237, 0.24);
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.audit-meta {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.audit-meta div,
.page-link {
  padding: 0.9rem 1rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.95);
}

.page-link {
  display: grid;
  gap: 0.2rem;
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

@media (min-width: 768px) {
  .page-intro,
  .audit-row,
  .empty-card {
    padding: 1.5rem;
  }

  .page-intro {
    grid-template-columns: minmax(0, 1.2fr) minmax(14rem, 0.8fr);
  }

  .page-links {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .audit-meta {
    grid-template-columns: 1fr;
  }
}
</style>
