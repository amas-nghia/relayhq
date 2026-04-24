<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronLeft,
  Clock,
  FileText,
  History,
  MessageSquare,
  Send,
  ShieldCheck,
  ShieldAlert,
  User as UserIcon,
  X,
} from 'lucide-vue-next'

import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
} from '../../data/relayhq-overview'

const route = useRoute()
const taskId = route.params.id as string

const { data: vault, refresh } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
})

const taskRaw = computed(() => vault.value.tasks.find((task) => task.id === taskId) ?? null)
const approvalRaw = computed(() => vault.value.approvals.find((approval) => approval.taskId === taskId && approval.outcome === 'pending') ?? null)

const task = computed(() => {
  if (!taskRaw.value) return null
  return {
    id: taskRaw.value.id,
    title: taskRaw.value.title,
    status: taskRaw.value.status,
    priority: taskRaw.value.priority,
    assignee: taskRaw.value.assignee,
    progress: taskRaw.value.progress || 0,
    description: taskRaw.value.body || 'No description provided.',
    vaultPath: `vault/shared/tasks/${taskRaw.value.id}.md`,
    tags: taskRaw.value.tags || [],
    approval: {
      needed: taskRaw.value.approvalNeeded || !!approvalRaw.value,
      requestedBy: approvalRaw.value?.requestedBy || '',
      reason: approvalRaw.value?.reason || '',
      status: approvalRaw.value?.outcome || 'none',
    },
    timeline: [
      { label: 'Created', time: taskRaw.value.createdAt, note: `Task created by ${taskRaw.value.createdBy}` },
      { label: 'Synced', time: taskRaw.value.updatedAt, note: 'Last synchronization with vault' },
    ],
  }
})

const activePanel = ref<'overview' | 'approvals' | 'audit'>('overview')
const isProcessing = ref(false)
const approvalReason = ref('')
const commentDraft = ref('')
const assigneeValue = ref('')

watch(taskRaw, (nextTask) => {
  assigneeValue.value = nextTask?.assignee ?? ''
}, { immediate: true })

const assigneeIcon = computed(() => (task.value?.assignee || '').startsWith('agent') ? Bot : UserIcon)

const approveTask = async () => {
  if (isProcessing.value || !task.value) return
  isProcessing.value = true
  try {
    await $fetch(`/api/vault/tasks/${taskId}/approve`, { method: 'POST', body: { actorId: 'human-user' } })
    await refresh()
  } finally {
    isProcessing.value = false
  }
}

const rejectTask = async () => {
  if (isProcessing.value || !task.value) return
  const reason = approvalReason.value.trim() || 'Rejected from task detail.'
  isProcessing.value = true
  try {
    await $fetch(`/api/vault/tasks/${taskId}/reject`, { method: 'POST', body: { actorId: 'human-user', reason } })
    await refresh()
  } finally {
    isProcessing.value = false
  }
}

const saveAssignee = async () => {
  if (isProcessing.value || !task.value) return
  isProcessing.value = true
  try {
    await $fetch(`/api/vault/tasks/${taskId}`, {
      method: 'PATCH',
      body: { actorId: 'human-user', patch: { assignee: assigneeValue.value || '' } },
    })
    await refresh()
  } finally {
    isProcessing.value = false
  }
}
</script>

<template>
  <div v-if="task" class="space-y-8 pb-12">
    <header class="rounded-3xl border border-slate-800/80 bg-slate-950/80 px-6 py-6 shadow-2xl shadow-black/40">
      <div class="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div class="space-y-4">
          <NuxtLink to="/tasks" class="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-emerald-300">
            <ChevronLeft :size="14" />
            Back to tasks
          </NuxtLink>
          <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span class="rounded bg-slate-900 px-2 py-1 font-mono text-slate-300">{{ task.id }}</span>
            <span class="rounded-full border border-slate-700 px-2 py-1 font-bold uppercase tracking-wider text-slate-300">{{ task.status }}</span>
            <span class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-bold uppercase tracking-wider text-emerald-300">{{ task.priority }}</span>
          </div>
          <div>
            <h1 class="text-4xl font-semibold tracking-tight text-slate-50">{{ task.title }}</h1>
            <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{{ task.description }}</p>
          </div>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 xl:w-[360px] xl:grid-cols-2">
          <div class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4">
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Owner</p>
            <div class="mt-2 flex items-center gap-2 text-sm text-slate-100">
              <component :is="assigneeIcon" :size="14" class="text-slate-500" />
              {{ task.assignee || 'Unassigned' }}
            </div>
          </div>
          <div class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4">
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Progress</p>
            <p class="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{{ task.progress }}%</p>
          </div>
        </div>
      </div>
    </header>

    <div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section class="space-y-6">
        <div class="flex items-center gap-4 border-b border-slate-800 pb-2">
          <button class="pb-3 text-xs font-bold uppercase tracking-[0.18em] transition-colors" :class="activePanel === 'overview' ? 'text-emerald-300 border-b-2 border-emerald-400' : 'text-slate-500 hover:text-slate-300'" @click="activePanel = 'overview'">Overview</button>
          <button class="pb-3 text-xs font-bold uppercase tracking-[0.18em] transition-colors" :class="activePanel === 'approvals' ? 'text-emerald-300 border-b-2 border-emerald-400' : 'text-slate-500 hover:text-slate-300'" @click="activePanel = 'approvals'">Approvals</button>
          <button class="pb-3 text-xs font-bold uppercase tracking-[0.18em] transition-colors" :class="activePanel === 'audit' ? 'text-emerald-300 border-b-2 border-emerald-400' : 'text-slate-500 hover:text-slate-300'" @click="activePanel = 'audit'">Audit</button>
        </div>

        <div v-if="activePanel === 'overview'" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-xl shadow-black/30">
          <div class="grid gap-6 lg:grid-cols-2">
            <div class="space-y-3">
              <p class="theme-kicker text-[10px] font-bold uppercase">Vault record</p>
              <div class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm leading-6 text-slate-400">
                <p><span class="text-slate-500">Source:</span> {{ task.vaultPath }}</p>
                <p><span class="text-slate-500">Approval state:</span> {{ task.approval.status }}</p>
              </div>
            </div>
            <div class="space-y-3">
              <p class="theme-kicker text-[10px] font-bold uppercase">Tags</p>
              <div class="flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <span v-for="tag in task.tags" :key="tag" class="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">#{{ tag }}</span>
                <span v-if="task.tags.length === 0" class="text-sm text-slate-500">No tags</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="activePanel === 'approvals'" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-xl shadow-black/30">
          <div class="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <ShieldAlert :size="18" class="text-amber-300" />
            Approval gate
          </div>
          <div class="mt-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm leading-6 text-slate-400">
            <p><span class="text-slate-500">Needed:</span> {{ task.approval.needed ? 'Yes' : 'No' }}</p>
            <p><span class="text-slate-500">Requested by:</span> {{ task.approval.requestedBy || '—' }}</p>
            <p><span class="text-slate-500">Reason:</span> {{ task.approval.reason || 'No reason recorded.' }}</p>
          </div>

          <div v-if="task.approval.needed && task.approval.status === 'pending'" class="mt-4 space-y-4">
            <textarea v-model="approvalReason" rows="4" placeholder="Reason for rejection or change request" class="theme-input w-full rounded-2xl px-4 py-3 text-sm"></textarea>
            <div class="flex flex-wrap gap-3">
              <button class="theme-button-primary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" :disabled="isProcessing" @click="approveTask">
                <Check :size="14" class="mr-2 inline-flex" /> Approve
              </button>
              <button class="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-rose-300" :disabled="isProcessing" @click="rejectTask">
                <X :size="14" class="mr-2 inline-flex" /> Reject
              </button>
            </div>
          </div>
        </div>

        <div v-else class="space-y-3">
          <div v-for="item in task.timeline" :key="`${item.time}-${item.label}`" class="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-xl shadow-black/20">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="theme-kicker text-[10px] font-bold uppercase">{{ item.label }}</p>
                <p class="mt-2 text-sm text-slate-300">{{ item.note }}</p>
              </div>
              <span class="text-[11px] text-slate-500">{{ item.time }}</span>
            </div>
          </div>
        </div>
      </section>

      <aside class="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/30">
        <p class="theme-kicker text-[10px] font-bold uppercase">Coordination</p>
        <h2 class="mt-2 text-xl font-semibold tracking-tight text-slate-50">Update owner</h2>
        <p class="mt-2 text-sm leading-6 text-slate-400">Keep assignee changes inside the control plane without touching runtime execution details.</p>

        <div class="mt-4 space-y-4">
          <input v-model="assigneeValue" type="text" placeholder="Assignee" class="theme-input w-full rounded-2xl px-4 py-3 text-sm" />
          <button class="theme-button-secondary w-full rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" :disabled="isProcessing" @click="saveAssignee">Save assignee</button>
        </div>

        <div class="mt-6 border-t border-slate-800 pt-6">
          <p class="theme-kicker text-[10px] font-bold uppercase">Comments</p>
          <textarea v-model="commentDraft" rows="5" placeholder="Discussion history is not fully implemented yet." class="theme-input mt-3 w-full rounded-2xl px-4 py-3 text-sm"></textarea>
          <button class="theme-button-secondary mt-3 w-full rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" disabled>
            <Send :size="14" class="mr-2 inline-flex" />
            Send
          </button>
          <p class="mt-3 text-xs text-slate-500">This panel mirrors the new dark interaction model, but comment persistence remains out of scope for the current task runtime.</p>
        </div>
      </aside>
    </div>
  </div>
</template>
