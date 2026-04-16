<script setup lang="ts">
import { computed } from "vue";
import EmptyState from "../EmptyState.vue";
import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
  selectPendingApprovals,
  selectWorkspaceOverview,
} from "../../data/relayhq-overview";

type WorkspaceNavItem = {
  readonly label: string;
  readonly href: string;
  readonly note: string;
  readonly badge?: string;
};

type WorkspaceNavSection = {
  readonly title: string;
  readonly items: ReadonlyArray<WorkspaceNavItem>;
};

const { data: vault } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
});

const route = useRoute();
const workspace = computed(() => selectWorkspaceOverview(vault.value));
const pendingApprovals = computed(() => selectPendingApprovals(vault.value));
const hasWorkspaceData = computed(() => vault.value.workspaces.length > 0);

const sections = computed<ReadonlyArray<WorkspaceNavSection>>(() => [
  {
    title: "Workspace",
    items: [
      { label: "Overview", href: "/", note: "Control plane summary" },
      { label: "Projects", href: `/projects/${workspace.value.projectId}`, note: "Registered projects" },
      { label: "Agents", href: "/agents", note: "Assignment-ready registry" },
    ],
  },
  {
    title: "Coordination",
    items: [
      { label: "Board", href: `/boards/${workspace.value.boardId}`, note: "Visible work flow" },
      { label: "Tasks", href: `/tasks/${workspace.value.taskId}`, note: "Atomic work items" },
    ],
  },
  {
    title: "Governance",
    items: [
      {
        label: "Approvals",
        href: "/approvals",
        note: "Explicit checkpoints",
        badge: pendingApprovals.value.length > 0 ? String(pendingApprovals.value.length) : undefined,
      },
      {
        label: "Audit",
        href: "/audit",
        note: "Canonical history trail",
      },
    ],
  },
]);

function isActiveLink(href: string): boolean {
  return href === "/" ? route.path === "/" : route.path === href;
}
</script>

<template>
  <nav class="nav-card" aria-label="Workspace navigation">
    <EmptyState
      v-if="!hasWorkspaceData"
      title="No vault data found"
      description="Create shared workspace records under vault/shared to unlock the control-plane navigation and live views."
      action-label="Open overview"
      action-href="/"
    />

    <template v-else>
      <div class="nav-header">
        <p class="nav-kicker">Current workspace</p>
        <h2 class="nav-title">{{ workspace.name }}</h2>
        <p class="nav-copy">
          {{ workspace.summary }}
        </p>
        <span class="nav-status">{{ workspace.status }}</span>
      </div>

      <div v-for="section in sections" :key="section.title" class="nav-section">
        <p class="section-title">{{ section.title }}</p>
        <ul class="nav-list" role="list">
          <li v-for="item in section.items" :key="item.href">
            <NuxtLink class="nav-link" :class="{ 'nav-link-active': isActiveLink(item.href) }" :to="item.href" :aria-current="isActiveLink(item.href) ? 'page' : undefined">
              <span class="nav-link-topline">
                <span class="nav-link-label">{{ item.label }}</span>
                <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
              </span>
              <span class="nav-link-note">{{ item.note }}</span>
            </NuxtLink>
          </li>
        </ul>
      </div>
    </template>
  </nav>
</template>

<style scoped>
.nav-card {
  display: grid;
  gap: 1.25rem;
  padding: 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 20px 54px rgba(15, 23, 42, 0.08);
}

.nav-header {
  display: grid;
  gap: 0.4rem;
}

.nav-kicker,
.section-title {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

.nav-title {
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.nav-copy {
  margin: 0;
  color: #475569;
  line-height: 1.55;
}

.nav-status {
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

.nav-section {
  display: grid;
  gap: 0.75rem;
}

.nav-list {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
}

.nav-link {
  display: grid;
  gap: 0.2rem;
  padding: 0.85rem 0.95rem;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.9);
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.nav-link-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.nav-link:hover,
.nav-link:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(124, 58, 237, 0.24);
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.nav-link-active {
  border-color: rgba(124, 58, 237, 0.24);
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.nav-link-label {
  font-weight: 700;
  color: #0f172a;
}

.nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  min-height: 1.6rem;
  padding: 0 0.45rem;
  border: 1px solid rgba(245, 158, 11, 0.2);
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
  font-size: 0.75rem;
  font-weight: 700;
}

.nav-link-note {
  font-size: 0.875rem;
  color: #64748b;
}

@media (min-width: 768px) {
  .nav-card {
    padding: 1.5rem;
  }
}
</style>
