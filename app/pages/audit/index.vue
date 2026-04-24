<script setup lang="ts">
import { Activity, FileText, Search } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { AuditNoteResponse } from '../../server/api/vault/audit-notes.get'

interface AuditNotesPayload {
  readonly auditNotes: ReadonlyArray<AuditNoteResponse>
}

const filterQuery = ref('')
const { data, pending } = await useFetch<AuditNotesPayload>('/api/vault/audit-notes', {
  default: () => ({ auditNotes: [] }),
})

const auditNotes = computed(() => data.value?.auditNotes ?? [])
const visibleAuditNotes = computed(() => {
  const query = filterQuery.value.trim().toLowerCase()
  if (query.length === 0) return auditNotes.value
  return auditNotes.value.filter((note) => [note.message, note.source, note.taskId].some((value) => value.toLowerCase().includes(query)))
})

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

function formatRelativeTime(value: string): string {
  const deltaMs = new Date(value).getTime() - Date.now()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (Math.abs(deltaMs) < hour) return relativeTimeFormatter.format(Math.round(deltaMs / minute), 'minute')
  if (Math.abs(deltaMs) < day) return relativeTimeFormatter.format(Math.round(deltaMs / hour), 'hour')
  return relativeTimeFormatter.format(Math.round(deltaMs / day), 'day')
}
</script>

<template>
  <div class="space-y-8 pb-12">
    <header class="rounded-3xl border border-slate-800/80 bg-slate-950/80 px-6 py-6 shadow-2xl shadow-black/40">
      <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p class="theme-kicker text-[10px] font-bold uppercase">Governance</p>
          <h1 class="mt-2 text-4xl font-semibold tracking-tight text-slate-50">Audit trail</h1>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-400">A dark-first evidence view over canonical audit notes from the shared vault.</p>
        </div>

        <div class="relative w-full xl:w-80">
          <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input v-model="filterQuery" type="text" placeholder="Filter audit notes" class="theme-input w-full rounded-2xl py-3 pl-11 pr-4 text-sm" />
        </div>
      </div>
    </header>

    <div v-if="pending" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-8 text-sm text-slate-400 shadow-xl shadow-black/30">Loading audit notes...</div>

    <div v-else-if="auditNotes.length === 0" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-8 text-center shadow-xl shadow-black/30">
      <Activity class="mx-auto h-10 w-10 text-slate-500" />
      <h2 class="mt-4 text-xl font-semibold text-slate-50">No audit notes yet</h2>
      <p class="mt-2 text-sm text-slate-400">The shared vault has not recorded any audit notes yet.</p>
    </div>

    <div v-else-if="visibleAuditNotes.length === 0" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-8 text-sm text-slate-400 shadow-xl shadow-black/30">No audit notes match the current filter.</div>

    <div v-else class="space-y-4">
      <article v-for="note in visibleAuditNotes" :key="note.id" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-xl shadow-black/30">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div class="min-w-0 space-y-3">
            <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span class="font-mono">{{ note.id }}</span>
              <span class="rounded-full border border-slate-700 px-2 py-1 font-bold uppercase tracking-wider text-slate-300">{{ note.source }}</span>
            </div>
            <div class="flex items-start gap-3">
              <div class="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-emerald-300">
                <FileText :size="18" />
              </div>
              <div class="min-w-0">
                <h2 class="text-xl font-semibold tracking-tight text-slate-50">{{ note.message }}</h2>
                <p class="mt-2 break-all text-sm text-slate-400">{{ note.sourcePath }}</p>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4 text-sm text-slate-400">
            <p><span class="text-slate-500">Recorded:</span> {{ formatRelativeTime(note.createdAt) }}</p>
            <p class="mt-2"><NuxtLink :to="`/tasks/${note.taskId}`" class="text-emerald-300 hover:text-emerald-200">View task {{ note.taskId }}</NuxtLink></p>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>
