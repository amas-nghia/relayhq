<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, Bot, ChevronLeft, Clock, ShieldCheck, User as UserIcon } from 'lucide-vue-next'

import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
  selectBoardSummary,
  selectProjectSummary,
} from '../../data/relayhq-overview'

const route = useRoute()

const boardId = computed(() => {
  const value = route.params.board
  return typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : ''
})

const { data: vault } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
})

const board = computed(() => selectBoardSummary(vault.value, boardId.value))
const project = computed(() => selectProjectSummary(vault.value, board.value.projectId))
const hasBoardData = computed(() => vault.value.boards.some((entry) => entry.id === boardId.value))

const priorityIcon = (priority: string) => {
  if (priority === 'critical') return '▲▲'
  if (priority === 'high') return '▲'
  if (priority === 'medium') return '•'
  return '▼'
}

const assigneeIcon = (assignee: string) => assignee.startsWith('agent') ? Bot : UserIcon
</script>

<template>
  <div v-if="hasBoardData" class="space-y-8 pb-12">
    <header class="rounded-3xl border border-slate-800/80 bg-slate-950/80 px-6 py-6 shadow-2xl shadow-black/40">
      <div class="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div class="space-y-3">
          <NuxtLink to="/" class="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-emerald-300">
            <ChevronLeft :size="14" />
            Back to workspace
          </NuxtLink>
          <div>
            <p class="theme-kicker text-[10px] font-bold uppercase">Board</p>
            <h1 class="mt-2 text-4xl font-semibold tracking-tight text-slate-50">{{ board.name }}</h1>
            <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{{ board.summary }}</p>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div v-for="metric in board.metrics" :key="metric.label" class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4">
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{{ metric.label }}</p>
            <p class="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{{ metric.value }}</p>
            <p class="mt-1 text-xs text-slate-400">{{ metric.note }}</p>
          </div>
        </div>
      </div>
    </header>

    <section class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div class="overflow-x-auto kanban-scroll">
        <div class="flex min-h-[70vh] gap-4 pb-4">
          <article v-for="column in board.columns" :key="column.id" class="w-[320px] shrink-0 rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-xl shadow-black/30">
            <header class="mb-4 flex items-center justify-between gap-3">
              <div>
                <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{{ String(column.position).padStart(2, '0') }}</p>
                <h2 class="mt-1 text-sm font-semibold uppercase tracking-[0.12em] text-slate-200">{{ column.title }}</h2>
              </div>
              <span class="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-300">{{ column.taskCount }}</span>
            </header>

            <p class="mb-4 text-xs leading-5 text-slate-500">{{ column.summary }}</p>

            <div class="space-y-3">
              <NuxtLink
                v-for="task in column.tasks"
                :key="task.id"
                :to="`/tasks/${task.id}`"
                class="block rounded-2xl border border-slate-800 bg-slate-900/90 p-4 transition-all hover:border-emerald-500/40 hover:bg-slate-900"
                :class="{
                  'border-l-4 border-l-rose-500': task.isStale,
                  'border-l-4 border-l-amber-400': task.approval === 'pending' && !task.isStale,
                  'border-l-4 border-l-rose-400/80': task.priority === 'critical' && !task.isStale && task.approval !== 'pending',
                }"
              >
                <div v-if="task.isStale" class="mb-2 inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-300">
                  <Clock :size="12" /> Stale
                </div>

                <div class="mb-2 flex items-start justify-between gap-3">
                  <div class="flex items-center gap-2 text-[11px] text-slate-500">
                    <span class="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-slate-300">{{ priorityIcon(task.priority) }}</span>
                    <span class="font-mono">{{ task.id }}</span>
                  </div>
                  <span v-if="task.approval === 'pending'" class="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">Approval Req</span>
                </div>

                <h3 class="text-sm font-semibold leading-5 text-slate-100">{{ task.title }}</h3>
                <p class="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{{ task.note }}</p>

                <div class="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
                  <div class="flex items-center gap-2 text-xs text-slate-400">
                    <component :is="assigneeIcon(task.assignee)" :size="13" class="text-slate-500" />
                    <span class="font-medium">{{ task.assignee }}</span>
                  </div>

                  <div class="flex items-center gap-2 text-xs text-slate-400">
                    <span v-if="task.approval === 'approved'" class="inline-flex items-center gap-1 text-emerald-300"><ShieldCheck :size="12" /> Approved</span>
                    <span>{{ task.progress }}%</span>
                  </div>
                </div>
              </NuxtLink>
            </div>
          </article>
        </div>
      </div>

      <aside class="space-y-4">
        <section class="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/30">
          <p class="theme-kicker text-[10px] font-bold uppercase">Project</p>
          <h2 class="mt-2 text-xl font-semibold tracking-tight text-slate-50">{{ project.name }}</h2>
          <p class="mt-3 text-sm leading-6 text-slate-400">{{ project.summary }}</p>
          <div class="mt-4 grid gap-2 text-sm text-slate-400">
            <p><span class="text-slate-500">Project file:</span> {{ project.sourcePath }}</p>
            <p><span class="text-slate-500">Board file:</span> {{ board.sourcePath }}</p>
            <p><span class="text-slate-500">Workspace:</span> {{ board.workspaceName }}</p>
          </div>
        </section>

        <section class="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/30">
          <p class="theme-kicker text-[10px] font-bold uppercase">Workflow boundary</p>
          <ul class="mt-4 space-y-3 text-sm leading-6 text-slate-400">
            <li>Shows board flow, ownership, stale state, and approval gates.</li>
            <li>Keeps execution outside RelayHQ and inside external runtimes.</li>
            <li>Uses vault-backed board summaries instead of mock kanban state.</li>
          </ul>
        </section>
      </aside>
    </section>
  </div>

  <EmptyState
    v-else
    title="No board data found"
    description="This route does not map to a shared board record yet. Seed vault/shared/boards and linked task files to populate the board view."
    action-label="Open workspace overview"
    action-href="/"
  />
</template>
