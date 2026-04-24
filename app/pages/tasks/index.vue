<script setup lang="ts">
import {
  Bot,
  ChevronDown,
  List,
  Plus,
  Search,
  ShieldCheck,
  ShieldAlert,
  User,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'

import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
} from '../../data/relayhq-overview'
import { useKiokuSearch } from '../../composables/useKiokuSearch'

const { data: vault, refresh } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
})

const isCreatingTask = ref(false)
const viewMode = ref<'list' | 'board'>('list')
const selectedProjectId = ref('all')
const newTaskForm = ref({
  title: '',
  projectId: '',
  boardId: '',
  column: 'todo',
  priority: 'medium',
  assignee: 'human-user',
})

const kiokuSearch = useKiokuSearch()
const searchQuery = kiokuSearch.query

const projects = computed(() => vault.value.projects)
const boards = computed(() => vault.value.boards.filter((board) => newTaskForm.value.projectId ? board.projectId === newTaskForm.value.projectId : true))

watch(searchQuery, (value) => {
  void kiokuSearch.search(value)
})

watch(() => newTaskForm.value.projectId, (projectId) => {
  const firstBoard = vault.value.boards.find((board) => board.projectId === projectId)
  newTaskForm.value.boardId = firstBoard?.id ?? ''
})

const displayedTasks = computed(() => {
  const sourceTasks = searchQuery.value.trim().length > 0 ? kiokuSearch.results.value?.tasks ?? [] : vault.value.tasks
  return sourceTasks.filter((task) => selectedProjectId.value === 'all' || task.projectId === selectedProjectId.value)
})

const boardColumns = computed(() => [
  { id: 'todo', title: 'Todo' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' },
])

const tasksByColumn = (columnId: string) => displayedTasks.value.filter((task) => {
  if (columnId === 'review' && task.approvalNeeded) return true
  return task.status === columnId
})

const assigneeIcon = (assignee: string) => assignee.startsWith('agent') ? Bot : User

const prioritySymbol = (priority: string) => {
  if (priority === 'critical') return '▲▲'
  if (priority === 'high') return '▲'
  if (priority === 'medium') return '•'
  return '▼'
}

const submitTask = async () => {
  if (!newTaskForm.value.title.trim() || !newTaskForm.value.projectId || !newTaskForm.value.boardId) {
    return
  }

  try {
    await $fetch('/api/vault/tasks', {
      method: 'POST',
      body: {
        ...newTaskForm.value,
        title: newTaskForm.value.title.trim(),
      },
    })
    newTaskForm.value.title = ''
    isCreatingTask.value = false
    await refresh()
  } catch (error) {
    console.error('Failed to create task', error)
  }
}
</script>

<template>
  <div class="space-y-8 pb-12">
    <header class="rounded-3xl border border-slate-800/80 bg-slate-950/80 px-6 py-6 shadow-2xl shadow-black/40">
      <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div class="space-y-3">
          <p class="theme-kicker text-[10px] font-bold uppercase">Tasks</p>
          <h1 class="text-4xl font-semibold tracking-tight text-slate-50">All work items</h1>
          <p class="max-w-3xl text-sm leading-6 text-slate-400">Search the live vault, scan all coordination work, and open the task sidecar flow without dropping to the CLI.</p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <button
            class="rounded-2xl border px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="viewMode === 'list' ? 'theme-button-primary' : 'theme-button-secondary'"
            @click="viewMode = 'list'"
          >
            <List :size="14" class="mr-2 inline-flex" />
            List
          </button>
          <button
            class="rounded-2xl border px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            :class="viewMode === 'board' ? 'theme-button-primary' : 'theme-button-secondary'"
            @click="viewMode = 'board'"
          >
            Board
          </button>
          <button class="theme-button-primary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" @click="isCreatingTask = true">
            <Plus :size="14" class="mr-2 inline-flex" />
            New Task
          </button>
        </div>
      </div>
    </header>

    <section class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-xl shadow-black/30">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="relative w-full lg:max-w-md">
          <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input v-model="searchQuery" type="text" placeholder="Search tasks across Kioku and the vault..." class="theme-input w-full rounded-2xl py-3 pl-11 pr-4 text-sm" />
        </div>

        <div class="relative w-full lg:w-72">
          <select v-model="selectedProjectId" class="theme-input w-full appearance-none rounded-2xl py-3 pl-4 pr-10 text-sm">
            <option value="all">All Projects</option>
            <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
          </select>
          <ChevronDown class="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>
      </div>

      <p v-if="kiokuSearch.error" class="mt-4 text-sm text-rose-400">{{ kiokuSearch.error }}</p>
    </section>

    <div v-if="isCreatingTask" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div class="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl shadow-black/50">
        <div class="mb-6 flex items-start justify-between gap-4">
          <div>
            <p class="theme-kicker text-[10px] font-bold uppercase">Create</p>
            <h2 class="mt-2 text-2xl font-semibold tracking-tight text-slate-50">New task</h2>
            <p class="mt-2 text-sm text-slate-400">Write a new canonical task into the shared vault.</p>
          </div>
          <button class="rounded-2xl border border-slate-800 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-900" @click="isCreatingTask = false">Close</button>
        </div>

        <form class="space-y-4" @submit.prevent="submitTask">
          <input v-model="newTaskForm.title" type="text" placeholder="Task title" class="theme-input w-full rounded-2xl px-4 py-3 text-sm" />

          <div class="grid gap-4 md:grid-cols-2">
            <select v-model="newTaskForm.projectId" class="theme-input rounded-2xl px-4 py-3 text-sm">
              <option value="" disabled>Select project</option>
              <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.name }}</option>
            </select>

            <select v-model="newTaskForm.boardId" class="theme-input rounded-2xl px-4 py-3 text-sm">
              <option value="" disabled>Select board</option>
              <option v-for="board in boards" :key="board.id" :value="board.id">{{ board.name }}</option>
            </select>
          </div>

          <div class="grid gap-4 md:grid-cols-3">
            <select v-model="newTaskForm.column" class="theme-input rounded-2xl px-4 py-3 text-sm">
              <option value="todo">Todo</option>
              <option value="in-progress">In Progress</option>
              <option value="review">Review</option>
              <option value="done">Done</option>
            </select>

            <select v-model="newTaskForm.priority" class="theme-input rounded-2xl px-4 py-3 text-sm">
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <input v-model="newTaskForm.assignee" type="text" placeholder="Assignee" class="theme-input rounded-2xl px-4 py-3 text-sm" />
          </div>

          <div class="flex justify-end gap-3 pt-2">
            <button type="button" class="theme-button-secondary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" @click="isCreatingTask = false">Cancel</button>
            <button type="submit" class="theme-button-primary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider">Create Task</button>
          </div>
        </form>
      </div>
    </div>

    <section v-if="viewMode === 'list'" class="overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/70 shadow-xl shadow-black/30">
      <div v-if="kiokuSearch.pending" class="border-b border-slate-800 px-6 py-3 text-sm text-slate-400">Searching live index...</div>
      <div v-if="displayedTasks.length === 0" class="p-10 text-center text-sm text-slate-500">No tasks match the current view.</div>
      <table v-else class="w-full border-collapse text-left">
        <thead>
          <tr class="border-b border-slate-800 bg-slate-950/90">
            <th class="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Task</th>
            <th class="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Project</th>
            <th class="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Owner</th>
            <th class="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">State</th>
            <th class="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Progress</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="task in displayedTasks" :key="task.id" class="border-b border-slate-900/80 transition-colors hover:bg-slate-900/60">
            <td class="px-6 py-5">
              <NuxtLink :to="`/tasks/${task.id}`" class="block">
                <div class="flex items-center gap-2 text-[11px] text-slate-500">
                  <span class="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-slate-300">{{ prioritySymbol(task.priority) }}</span>
                  <span class="font-mono">{{ task.id }}</span>
                </div>
                <div class="mt-2 flex items-center gap-2">
                  <span class="text-sm font-semibold text-slate-100">{{ task.title }}</span>
                  <span v-if="task.approvalNeeded" class="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">Approval</span>
                </div>
              </NuxtLink>
            </td>
            <td class="px-6 py-5 text-sm text-slate-400">{{ task.projectId }}</td>
            <td class="px-6 py-5">
              <div class="flex items-center gap-2 text-sm text-slate-300">
                <component :is="assigneeIcon(task.assignee)" :size="14" class="text-slate-500" />
                {{ task.assignee }}
              </div>
            </td>
            <td class="px-6 py-5">
              <div class="flex flex-wrap gap-2">
                <span class="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">{{ task.status }}</span>
                <span v-if="task.isStale" class="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-300">Stale</span>
              </div>
            </td>
            <td class="px-6 py-5">
              <div class="flex items-center gap-3">
                <div class="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                  <div class="h-full rounded-full bg-emerald-400" :style="{ width: `${task.progress || 0}%` }"></div>
                </div>
                <span class="text-xs font-bold text-slate-400">{{ task.progress || 0 }}%</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-else class="overflow-x-auto kanban-scroll">
      <div class="flex gap-4 pb-4">
        <article v-for="column in boardColumns" :key="column.id" class="w-[320px] shrink-0 rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-xl shadow-black/30">
          <header class="mb-4 flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">{{ column.title }}</h2>
            <span class="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-300">{{ tasksByColumn(column.id).length }}</span>
          </header>

          <div class="space-y-3">
            <NuxtLink
              v-for="task in tasksByColumn(column.id)"
              :key="task.id"
              :to="`/tasks/${task.id}`"
              class="block rounded-2xl border border-slate-800 bg-slate-900/90 p-4 transition-all hover:border-emerald-500/40"
              :class="{
                'border-l-4 border-l-rose-500': task.isStale,
                'border-l-4 border-l-amber-400': task.approvalNeeded && !task.isStale,
              }"
            >
              <div class="mb-2 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                <span class="font-mono">{{ task.id }}</span>
                <span class="inline-flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-slate-300">{{ prioritySymbol(task.priority) }}</span>
              </div>
              <h3 class="text-sm font-semibold leading-5 text-slate-100">{{ task.title }}</h3>
              <div class="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
                <div class="flex items-center gap-2">
                  <component :is="assigneeIcon(task.assignee)" :size="13" class="text-slate-500" />
                  {{ task.assignee }}
                </div>
                <div class="flex items-center gap-2">
                  <span v-if="task.approvalNeeded" class="inline-flex items-center gap-1 text-amber-300"><ShieldAlert :size="12" /> Gate</span>
                  <span v-else-if="task.approvalOutcome === 'approved'" class="inline-flex items-center gap-1 text-emerald-300"><ShieldCheck :size="12" /> Approved</span>
                  <span>{{ task.progress || 0 }}%</span>
                </div>
              </div>
            </NuxtLink>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
