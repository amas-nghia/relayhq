<script setup lang="ts">
import { computed } from "vue";
import { Activity, Bot, FolderKanban, LayoutDashboard, ShieldAlert, SquareKanban } from 'lucide-vue-next'

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
  readonly icon: unknown;
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

const sections = computed<ReadonlyArray<WorkspaceNavSection>>(() => [
  {
    title: "Workspace",
    items: [
      { label: "Overview", href: "/", note: "Dashboard and KPIs", icon: LayoutDashboard },
      { label: "Projects", href: `/projects/${workspace.value.projectId}`, note: "Project surfaces", icon: FolderKanban },
      { label: "Agents", href: "/agents", note: "Registry and live sessions", icon: Bot },
    ],
  },
  {
    title: "Coordination",
    items: [
      { label: "Board", href: `/boards/${workspace.value.boardId}`, note: "Kanban flow", icon: SquareKanban },
      { label: "Tasks", href: `/tasks`, note: "All work items", icon: Activity },
    ],
  },
  {
    title: "Governance",
    items: [
      {
        label: "Approvals",
        href: "/approvals",
        note: "Human checkpoints",
        icon: ShieldAlert,
        badge: pendingApprovals.value.length > 0 ? String(pendingApprovals.value.length) : undefined,
      },
      {
        label: "Audit",
        href: "/audit",
        note: "Traceability and notes",
        icon: Activity,
      },
    ],
  },
]);

function isActiveLink(href: string): boolean {
  return href === "/" ? route.path === "/" : route.path === href;
}
</script>

<template>
  <nav class="space-y-6" aria-label="Workspace navigation">
    <div class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <p class="theme-kicker text-[10px] font-bold uppercase">Current workspace</p>
      <h2 class="mt-2 text-lg font-semibold tracking-tight text-slate-50">{{ workspace.name }}</h2>
      <p class="mt-2 text-sm leading-6 text-slate-400">{{ workspace.summary }}</p>
      <div class="mt-3 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
        {{ workspace.status }}
      </div>
    </div>

    <section v-for="section in sections" :key="section.title" class="space-y-2">
      <p class="px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{{ section.title }}</p>
      <ul class="space-y-1" role="list">
        <li v-for="item in section.items" :key="item.href">
          <NuxtLink
            :to="item.href"
            class="group flex items-center justify-between rounded-2xl border px-3 py-3 transition-all"
            :class="isActiveLink(item.href)
              ? 'border-emerald-500/30 bg-emerald-500/10 text-slate-50 shadow-lg shadow-emerald-500/10'
              : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:bg-slate-900'"
            :aria-current="isActiveLink(item.href) ? 'page' : undefined"
          >
            <div class="flex min-w-0 items-start gap-3">
              <component :is="item.icon" class="mt-0.5 h-4 w-4 shrink-0" :class="isActiveLink(item.href) ? 'text-emerald-300' : 'text-slate-500 group-hover:text-slate-300'" />
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold">{{ item.label }}</span>
                  <span v-if="item.badge" class="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-300">{{ item.badge }}</span>
                </div>
                <p class="mt-0.5 text-xs text-slate-500 group-hover:text-slate-400">{{ item.note }}</p>
              </div>
            </div>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </nav>
</template>
