<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Activity, Bot, Cpu, Plus } from 'lucide-vue-next'

import { loadVaultReadModel, selectAgentRegistry, type AgentRegistryRecord } from '~/data/relayhq-overview'

interface ActiveAgentSession {
  agentName: string;
  lastSeenAt: string;
  idleSeconds: number;
}

interface ActiveAgentCard extends ActiveAgentSession {
  lockedTask: { id: string; title: string } | null;
}

const registeredAgents = ref<AgentRegistryRecord[]>([])
const activeAgents = ref<ActiveAgentCard[]>([])
const isRegistering = ref(false)
const newAgentForm = ref({
  name: 'agent-product-strategist',
  role: 'product-strategist',
  model: 'claude-sonnet-4-6',
  provider: 'anthropic',
})

let intervalId: ReturnType<typeof setInterval> | null = null

const fetchData = async () => {
  const [model, sessions] = await Promise.all([
    loadVaultReadModel(),
    $fetch<ActiveAgentSession[]>('/api/agent/active'),
  ])

  registeredAgents.value = selectAgentRegistry(model) as AgentRegistryRecord[]
  activeAgents.value = sessions.map((session) => {
    const lockedTask = model.tasks.find((task) => task.lockedBy === session.agentName.replace(/#\d+$/, ''))
    return {
      ...session,
      lockedTask: lockedTask ? { id: lockedTask.id, title: lockedTask.title } : null,
    }
  })
}

onMounted(() => {
  void fetchData()
  intervalId = setInterval(() => { void fetchData() }, 15000)
})

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId)
})

const registerAgent = async () => {
  await $fetch('/api/vault/agents', { method: 'POST', body: newAgentForm.value })
  isRegistering.value = false
  await fetchData()
}
</script>

<template>
  <div class="space-y-8 pb-12">
    <header class="rounded-3xl border border-slate-800/80 bg-slate-950/80 px-6 py-6 shadow-2xl shadow-black/40">
      <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p class="theme-kicker text-[10px] font-bold uppercase">Agents</p>
          <h1 class="mt-2 text-4xl font-semibold tracking-tight text-slate-50">Live agent sessions</h1>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-400">This page now behaves like the dark main reference: it is centered on active agent presence first, with the registry as the secondary surface.</p>
        </div>
        <button class="theme-button-primary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" @click="isRegistering = !isRegistering">
          <Plus :size="14" class="mr-2 inline-flex" /> Register Agent
        </button>
      </div>
    </header>

    <div v-if="isRegistering" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-xl shadow-black/30">
      <div class="grid gap-4 md:grid-cols-2">
        <input v-model="newAgentForm.name" class="theme-input rounded-2xl px-4 py-3 text-sm" placeholder="Agent name" />
        <input v-model="newAgentForm.role" class="theme-input rounded-2xl px-4 py-3 text-sm" placeholder="Role" />
        <input v-model="newAgentForm.model" class="theme-input rounded-2xl px-4 py-3 text-sm" placeholder="Model" />
        <input v-model="newAgentForm.provider" class="theme-input rounded-2xl px-4 py-3 text-sm" placeholder="Provider" />
      </div>
      <div class="mt-4 flex justify-end">
        <button class="theme-button-primary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" @click="registerAgent">Create registry record</button>
      </div>
    </div>

    <section class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div class="space-y-4">
        <div v-if="activeAgents.length === 0" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-8 text-center shadow-xl shadow-black/30">
          <Activity class="mx-auto h-10 w-10 text-slate-500" />
          <h2 class="mt-4 text-xl font-semibold text-slate-50">No active agents</h2>
          <p class="mt-2 text-sm text-slate-400">No agent session has checked in recently.</p>
        </div>

        <article v-for="agent in activeAgents" :key="agent.agentName" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-xl shadow-black/30">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="flex items-center gap-2">
                <Bot :size="16" class="text-emerald-300" />
                <h2 class="text-xl font-semibold tracking-tight text-slate-50">{{ agent.agentName }}</h2>
              </div>
              <p class="mt-2 text-sm text-slate-400">Last seen {{ agent.lastSeenAt }}</p>
            </div>
            <span class="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider" :class="agent.idleSeconds < 120 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'">
              {{ agent.idleSeconds < 120 ? 'Active' : 'Idle' }}
            </span>
          </div>

          <div class="mt-4 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4 text-sm text-slate-400">
            <p><span class="text-slate-500">Idle seconds:</span> {{ agent.idleSeconds }}</p>
            <p v-if="agent.lockedTask" class="mt-2"><span class="text-slate-500">Locked task:</span> <NuxtLink :to="`/tasks/${agent.lockedTask.id}`" class="text-emerald-300 hover:text-emerald-200">{{ agent.lockedTask.title }}</NuxtLink></p>
          </div>
        </article>
      </div>

      <aside class="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/30">
        <p class="theme-kicker text-[10px] font-bold uppercase">Registry</p>
        <h2 class="mt-2 text-xl font-semibold tracking-tight text-slate-50">Available agents</h2>
        <div class="mt-4 space-y-3">
          <div v-for="agent in registeredAgents" :key="agent.id" class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4">
            <div class="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Cpu :size="14" class="text-slate-500" />
              {{ agent.name }}
            </div>
            <p class="mt-2 text-xs text-slate-400">{{ agent.role }} • {{ agent.model }}</p>
          </div>
        </div>
      </aside>
    </section>
  </div>
</template>
