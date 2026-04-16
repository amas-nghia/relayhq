<script setup lang="ts">
import { computed } from "vue";
import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
  selectPendingApprovals,
  selectWorkspaceLinks,
  selectWorkspaceOverview,
} from "../data/relayhq-overview";

const { data: vault } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
});

const workspace = computed(() => selectWorkspaceOverview(vault.value));
const pendingApprovals = computed(() => selectPendingApprovals(vault.value));
const workspaceLinks = computed(() => selectWorkspaceLinks(vault.value));
</script>

<template>
  <div class="approvals-page">
    <section class="page-intro" aria-labelledby="approvals-page-title">
      <div class="intro-copy">
        <p class="eyebrow">Approvals queue</p>
        <h1 id="approvals-page-title">Pending human gates for {{ workspace.name }}</h1>
        <p>
          This queue highlights every task still waiting on an explicit human decision before work can continue.
        </p>
      </div>

      <div class="summary-card">
        <span class="summary-label">Pending approvals</span>
        <strong>{{ pendingApprovals.length }}</strong>
      </div>
    </section>

    <section v-if="pendingApprovals.length > 0" class="approvals-list" aria-label="Pending approvals list">
      <NuxtLink v-for="approval in pendingApprovals" :key="approval.id" class="approval-row" :to="`/tasks/${approval.taskId}`">
        <div class="approval-main">
          <p class="approval-id">{{ approval.id }}</p>
          <h2>{{ approval.taskTitle }}</h2>
          <p class="approval-reason">{{ approval.reason }}</p>
        </div>

        <dl class="approval-meta">
          <div>
            <dt>Assignee</dt>
            <dd>{{ approval.assignee }}</dd>
          </div>
          <div>
            <dt>Requested at</dt>
            <dd>{{ approval.requestedAt }}</dd>
          </div>
          <div>
            <dt>Requested by</dt>
            <dd>{{ approval.requestedBy ?? "—" }}</dd>
          </div>
        </dl>
      </NuxtLink>
    </section>

    <section v-else class="empty-card" aria-labelledby="approvals-empty-title">
      <p class="eyebrow">No pending approvals</p>
      <h2 id="approvals-empty-title">Nothing is waiting on a human gate right now</h2>
      <p>The vault currently shows no task with a pending approval outcome.</p>
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
.approvals-page {
  display: grid;
  gap: 1rem;
}

.page-intro,
.summary-card,
.approval-row,
.empty-card {
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.page-intro,
.approval-row,
.approval-main,
.approval-meta,
.page-links,
.approvals-list,
.intro-copy,
.empty-card {
  display: grid;
  gap: 0.75rem;
}

.page-intro,
.approval-row,
.empty-card {
  padding: 1.25rem;
}

.page-intro {
  align-items: start;
}

.eyebrow,
.summary-label,
.approval-id,
.approval-meta dt {
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
.approval-reason,
.approval-meta dd,
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
  background: rgba(245, 158, 11, 0.08);
}

.summary-card strong {
  font-size: 2rem;
  color: #92400e;
}

.approval-row {
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.approval-row:hover,
.approval-row:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(124, 58, 237, 0.24);
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.approval-meta {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.approval-meta div,
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
  .approval-row,
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
  .approval-meta {
    grid-template-columns: 1fr;
  }
}
</style>
