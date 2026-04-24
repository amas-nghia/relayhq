<script setup lang="ts">
import { computed } from 'vue'
import { Bot, Check, Clock, ShieldAlert, ShieldCheck, User, X } from 'lucide-vue-next'

import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
  selectPendingApprovals,
} from '../../data/relayhq-overview'

const { data: vault, refresh } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
})

const pendingApprovals = computed(() => selectPendingApprovals(vault.value))
const historicalApprovals = computed(() => vault.value.approvals.filter((approval) => approval.outcome !== 'pending').slice(0, 10))

const getTaskTitle = (taskId: string) => vault.value.tasks.find((task) => task.id === taskId)?.title ?? taskId

const handleApprove = async (taskId: string) => {
  await $fetch(`/api/vault/tasks/${taskId}/approve`, { method: 'POST', body: { actorId: 'human-reviewer' } })
  await refresh()
}

const handleReject = async (taskId: string) => {
  const reason = prompt('Reason for rejection:')
  if (!reason) return
  await $fetch(`/api/vault/tasks/${taskId}/reject`, { method: 'POST', body: { actorId: 'human-reviewer', reason } })
  await refresh()
}
</script>

<template>
  <div class="space-y-8 pb-12">
    <header class="rounded-3xl border border-slate-800/80 bg-slate-950/80 px-6 py-6 shadow-2xl shadow-black/40">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p class="theme-kicker text-[10px] font-bold uppercase">Governance</p>
          <h1 class="mt-2 text-4xl font-semibold tracking-tight text-slate-50">Approvals queue</h1>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Handle the human gates that block risky work. This queue is the operational checkpoint between agent autonomy and explicit approval.</p>
        </div>
        <div class="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-300">
          {{ pendingApprovals.length }} pending approvals
        </div>
      </div>
    </header>

    <div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section class="space-y-4">
        <div v-if="pendingApprovals.length === 0" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-8 text-center shadow-xl shadow-black/30">
          <ShieldCheck class="mx-auto h-10 w-10 text-emerald-300" />
          <h2 class="mt-4 text-xl font-semibold text-slate-50">No approvals are waiting</h2>
          <p class="mt-2 text-sm text-slate-400">The vault currently shows no task paused at a pending human gate.</p>
        </div>

        <article v-for="app in pendingApprovals" :key="app.id" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-xl shadow-black/30">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-3">
              <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span class="font-mono">{{ app.id }}</span>
                <span class="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-bold uppercase tracking-wider text-amber-300">Pending</span>
              </div>
              <h2 class="text-2xl font-semibold tracking-tight text-slate-50">{{ app.taskTitle }}</h2>
              <p class="text-sm leading-6 text-slate-400">{{ app.reason }}</p>
            </div>

            <div class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4 text-sm text-slate-400">
              <div class="flex items-center gap-2">
                <component :is="app.requestedBy?.startsWith('agent') ? Bot : User" :size="14" class="text-slate-500" />
                {{ app.requestedBy || 'System' }}
              </div>
              <div class="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <Clock :size="12" />
                {{ app.requestedAt }}
              </div>
            </div>
          </div>

          <div class="mt-5 flex flex-wrap gap-3">
            <button class="theme-button-primary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" @click="handleApprove(app.taskId)">
              <Check :size="14" class="mr-2 inline-flex" />
              Approve
            </button>
            <button class="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-rose-300" @click="handleReject(app.taskId)">
              <X :size="14" class="mr-2 inline-flex" />
              Reject
            </button>
          </div>
        </article>
      </section>

      <aside class="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/30">
        <p class="theme-kicker text-[10px] font-bold uppercase">History</p>
        <h2 class="mt-2 text-xl font-semibold tracking-tight text-slate-50">Recent decisions</h2>
        <div class="mt-4 space-y-3">
          <div v-if="historicalApprovals.length === 0" class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4 text-sm text-slate-500">No approval history found.</div>
          <div v-for="approval in historicalApprovals" :key="approval.id" class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-slate-100">{{ getTaskTitle(approval.taskId) }}</p>
                <p class="mt-1 text-xs text-slate-500">{{ approval.decidedBy || 'System' }} • {{ approval.decidedAt || approval.updatedAt }}</p>
              </div>
              <span class="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider" :class="approval.outcome === 'approved' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'">
                {{ approval.outcome }}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
