<script setup lang="ts">
import { AlertCircle, ChevronLeft } from 'lucide-vue-next'

import { emptyVaultReadModel, loadVaultReadModel, relayhqReadModelKey } from '../../data/relayhq-overview'

const route = useRoute()
const issueId = route.params.id as string

const { data: vault, refresh } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
})

const { data: issue, pending, refresh: refreshIssue } = await useFetch(`/api/vault/issues/${issueId}`)

const linkedTasks = computed(() => {
  if (!issue.value?.linkedTaskIds) return []
  return issue.value.linkedTaskIds.map((taskId: string) => vault.value.tasks.find((entry) => entry.id === taskId)).filter(Boolean)
})

const project = computed(() => vault.value.projects.find((entry) => entry.id === issue.value?.projectId) ?? null)
const editForm = ref({ title: '', problem: '' })
const commentForm = ref('')
const isSaving = ref(false)
const saveError = ref<string | null>(null)

watchEffect(() => {
  editForm.value.title = issue.value?.title ?? ''
  editForm.value.problem = issue.value?.problem ?? ''
})

const transitionOptions = computed(() => {
  switch (issue.value?.status) {
    case 'open': return ['investigating', 'wont-fix']
    case 'investigating': return ['resolved', 'wont-fix']
    default: return []
  }
})

const saveIssue = async () => {
  if (!issue.value || isSaving.value) return
  saveError.value = null
  isSaving.value = true
  try {
    await $fetch(`/api/vault/issues/${issueId}`, { method: 'PATCH', body: { actorId: 'human-user', patch: { title: editForm.value.title.trim(), problem: editForm.value.problem.trim() } } })
    await Promise.all([refreshIssue(), refresh()])
  } catch (error: any) {
    saveError.value = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Unable to save issue.'
  } finally {
    isSaving.value = false
  }
}

const transitionIssue = async (status: string) => {
  if (!issue.value || isSaving.value) return
  saveError.value = null
  isSaving.value = true
  try {
    await $fetch(`/api/vault/issues/${issueId}`, { method: 'PATCH', body: { actorId: 'human-user', patch: { status } } })
    await Promise.all([refreshIssue(), refresh()])
  } catch (error: any) {
    saveError.value = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Unable to update issue status.'
  } finally {
    isSaving.value = false
  }
}

const postComment = async () => {
  if (!issue.value || isSaving.value || commentForm.value.trim().length === 0) return
  saveError.value = null
  isSaving.value = true
  try {
    await $fetch(`/api/vault/issues/${issueId}/comments`, { method: 'POST', body: { actorId: 'human-user', body: commentForm.value.trim() } })
    commentForm.value = ''
    await Promise.all([refreshIssue(), refresh()])
  } catch (error: any) {
    saveError.value = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Unable to post comment.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div v-if="!pending && issue" class="space-y-8 pb-12">
    <header class="rounded-3xl border border-slate-800/80 bg-slate-950/80 px-6 py-6 shadow-2xl shadow-black/40">
      <NuxtLink :to="project ? `/projects/${project.id}` : '/projects'" class="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-emerald-300">
        <ChevronLeft :size="14" />
        Back to project
      </NuxtLink>

      <div class="mt-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span class="rounded-full border border-slate-700 px-2 py-1 font-bold uppercase tracking-wider text-slate-300">{{ issue.status }}</span>
            <span class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-bold uppercase tracking-wider text-emerald-300">{{ issue.priority }}</span>
          </div>
          <h1 class="mt-3 text-4xl font-semibold tracking-tight text-slate-50">{{ issue.title }}</h1>
          <p class="mt-3 text-sm leading-6 text-slate-400">Reported by {{ issue.reportedBy }} • Updated {{ issue.updatedAt }}</p>
        </div>

        <div class="space-y-2">
          <button v-for="status in transitionOptions" :key="status" class="theme-button-secondary block w-full rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" :disabled="isSaving" @click="transitionIssue(status)">
            {{ status }}
          </button>
        </div>
      </div>
    </header>

    <div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section class="space-y-6">
        <div class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-xl shadow-black/30">
          <p class="theme-kicker text-[10px] font-bold uppercase">Issue</p>
          <div class="mt-4 space-y-4">
            <input v-model="editForm.title" class="theme-input w-full rounded-2xl px-4 py-3 text-sm" />
            <textarea v-model="editForm.problem" rows="8" class="theme-input w-full rounded-2xl px-4 py-3 text-sm"></textarea>
            <button class="theme-button-primary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" :disabled="isSaving" @click="saveIssue">{{ isSaving ? 'Saving...' : 'Save Issue' }}</button>
            <p v-if="saveError" class="text-sm text-rose-400">{{ saveError }}</p>
          </div>
        </div>

        <div class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-xl shadow-black/30">
          <p class="theme-kicker text-[10px] font-bold uppercase">Linked tasks</p>
          <div class="mt-4 space-y-3">
            <div v-if="linkedTasks.length === 0" class="text-sm text-slate-500">No linked tasks yet.</div>
            <NuxtLink v-for="task in linkedTasks" :key="task!.id" :to="`/tasks/${task!.id}`" class="block rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4 transition-colors hover:border-emerald-500/40">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <p class="text-sm font-semibold text-slate-100">{{ task!.title }}</p>
                  <p class="mt-1 text-xs text-slate-500">{{ task!.id }}</p>
                </div>
                <span class="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">{{ task!.status }}</span>
              </div>
            </NuxtLink>
          </div>
        </div>
      </section>

      <aside class="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/30">
        <div class="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <AlertCircle :size="16" class="text-emerald-300" />
          Comments
        </div>
        <div class="mt-4 space-y-3">
          <div v-if="!issue.comments || issue.comments.length === 0" class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4 text-sm text-slate-500">No comments yet.</div>
          <div v-for="comment in issue.comments" :key="`${comment.author}-${comment.timestamp}`" class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4">
            <div class="flex items-center justify-between gap-3">
              <span class="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider" :class="comment.author.startsWith('agent-') ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-300'">{{ comment.author }}</span>
              <span class="text-[10px] text-slate-500">{{ comment.timestamp }}</span>
            </div>
            <p class="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">{{ comment.body }}</p>
          </div>

          <textarea v-model="commentForm" rows="5" placeholder="Reply to this issue" class="theme-input w-full rounded-2xl px-4 py-3 text-sm"></textarea>
          <button class="theme-button-primary w-full rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" :disabled="isSaving || commentForm.trim().length === 0" @click="postComment">Post Comment</button>
        </div>
      </aside>
    </div>
  </div>

  <div v-else-if="pending" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-8 text-sm text-slate-400 shadow-xl shadow-black/30">Loading issue…</div>
  <div v-else class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-8 text-sm text-slate-400 shadow-xl shadow-black/30">Issue not found.</div>
</template>
