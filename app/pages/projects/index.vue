<script setup lang="ts">
import { FolderKanban, Plus, Search } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
} from '../../data/relayhq-overview'

const { data: vault, refresh } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
})

const projects = computed(() => vault.value.projects)
const query = ref('')
const showCreateModal = ref(false)
const createName = ref('')
const createCodebaseRoot = ref('')
const createError = ref<string | null>(null)
const isCreating = ref(false)

const filteredProjects = computed(() => {
  const normalized = query.value.trim().toLowerCase()
  if (normalized.length === 0) return projects.value
  return projects.value.filter((project) => project.name.toLowerCase().includes(normalized) || project.id.toLowerCase().includes(normalized))
})

const submitProject = async () => {
  if (!createName.value.trim() || isCreating.value) return
  createError.value = null
  isCreating.value = true
  try {
    await $fetch('/api/vault/projects', {
      method: 'POST',
      body: {
        name: createName.value.trim(),
        codebaseRoot: createCodebaseRoot.value.trim() || undefined,
      },
    })
    await refresh()
    showCreateModal.value = false
    createName.value = ''
    createCodebaseRoot.value = ''
  } catch (error: any) {
    createError.value = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Unable to create project.'
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="space-y-8 pb-12">
    <header class="rounded-3xl border border-slate-800/80 bg-slate-950/80 px-6 py-6 shadow-2xl shadow-black/40">
      <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p class="theme-kicker text-[10px] font-bold uppercase">Projects</p>
          <h1 class="mt-2 text-4xl font-semibold tracking-tight text-slate-50">Workspace projects</h1>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Project cards are now the primary navigation surface instead of the older table-centric management view.</p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <div class="relative w-full sm:w-72">
            <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input v-model="query" type="text" placeholder="Search projects" class="theme-input w-full rounded-2xl py-3 pl-11 pr-4 text-sm" />
          </div>
          <button class="theme-button-primary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" @click="showCreateModal = true">
            <Plus :size="14" class="mr-2 inline-flex" /> New Project
          </button>
        </div>
      </div>
    </header>

    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div class="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-2xl shadow-black/50">
        <h2 class="text-2xl font-semibold tracking-tight text-slate-50">Create project</h2>
        <p class="mt-2 text-sm text-slate-400">Generate a project, board, and initial workflow columns in the shared vault.</p>
        <div class="mt-6 space-y-4">
          <input v-model="createName" type="text" placeholder="Project name" class="theme-input w-full rounded-2xl px-4 py-3 text-sm" />
          <input v-model="createCodebaseRoot" type="text" placeholder="Primary codebase root (optional)" class="theme-input w-full rounded-2xl px-4 py-3 text-sm" />
          <p v-if="createError" class="text-sm text-rose-400">{{ createError }}</p>
          <div class="flex justify-end gap-3">
            <button class="theme-button-secondary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" @click="showCreateModal = false">Cancel</button>
            <button class="theme-button-primary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" :disabled="isCreating" @click="submitProject">{{ isCreating ? 'Creating...' : 'Create' }}</button>
          </div>
        </div>
      </div>
    </div>

    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <NuxtLink v-for="project in filteredProjects" :key="project.id" :to="`/projects/${project.id}`" class="group rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-xl shadow-black/30 transition-all hover:border-emerald-500/40 hover:bg-slate-950">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-3">
            <div class="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-emerald-300">
              <FolderKanban :size="20" />
            </div>
            <div>
              <h2 class="text-xl font-semibold tracking-tight text-slate-50 group-hover:text-emerald-200">{{ project.name }}</h2>
              <p class="mt-2 text-xs font-mono text-slate-500">{{ project.id }}</p>
            </div>
          </div>
          <span class="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">Active</span>
        </div>

        <div class="mt-5 grid grid-cols-2 gap-3">
          <div class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4">
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Boards</p>
            <p class="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{{ project.boardIds.length }}</p>
          </div>
          <div class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4">
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Tasks</p>
            <p class="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{{ project.taskIds.length }}</p>
          </div>
        </div>
      </NuxtLink>

      <div v-if="filteredProjects.length === 0" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-8 text-center shadow-xl shadow-black/30 md:col-span-2 xl:col-span-3">
        <FolderKanban class="mx-auto h-10 w-10 text-slate-500" />
        <h2 class="mt-4 text-xl font-semibold text-slate-50">No projects found</h2>
        <p class="mt-2 text-sm text-slate-400">Create a project or change the search filter to see results.</p>
      </div>
    </section>
  </div>
</template>
