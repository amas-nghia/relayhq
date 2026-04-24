<script setup lang="ts">
import {
  FolderKanban,
  ChevronRight,
  FileText,
  Activity,
  Search,
  Database,
  RotateCw,
  GitBranch,
  ExternalLink,
  AlertCircle,
  Plus,
} from 'lucide-vue-next'
import EmptyState from '../../components/EmptyState.vue'
import {
  emptyVaultReadModel,
  loadVaultReadModel,
  relayhqReadModelKey,
  getProjectSummary
} from "../../data/relayhq-overview";
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const projectId = route.params.id as string

const { data: vault } = await useAsyncData(relayhqReadModelKey, loadVaultReadModel, {
  default: () => emptyVaultReadModel,
});

const summary = computed(() => getProjectSummary(projectId, vault.value))
const project = computed(() => vault.value.projects.find((entry) => entry.id === projectId) ?? null)
const activeTab = ref<'workflow' | 'issues' | 'docs'>('workflow')

const { data: docsData, pending: docsPending, refresh: refreshDocs } = await useFetch('/api/vault/docs', {
  query: { project_id: projectId },
  default: () => ({ success: true, data: [] as Array<{ id: string; title: string; doc_type: string; status: string; workspace_id: string; project_id: string | null; updated_at: string; created_at: string; tags: string[]; sourcePath: string }>, error: null as string | null }),
})
const issueStatusFilter = ref('all')
const issuePriorityFilter = ref('all')
const issueCreateForm = ref({ title: '', problem: '', priority: 'medium' })
const isCreatingIssue = ref(false)
const issueCreateError = ref<string | null>(null)
const { data: issueData, pending: issuesPending, refresh: refreshIssues } = await useFetch('/api/vault/issues', {
  query: computed(() => ({
    projectId,
    ...(issueStatusFilter.value === 'all' ? {} : { status: issueStatusFilter.value }),
  })),
  default: () => ({ issues: [] as Array<{ id: string; title: string; status: string; priority: string; reportedBy: string; createdAt: string; updatedAt: string; linkedTaskIds: string[]; tags: string[]; projectId: string }> }),
})
const { data: codeIndexStatus, pending: codeIndexPending, refresh: refreshCodeIndexStatus } = await useFetch(`/api/vault/projects/${projectId}/index-status`, {
  default: () => ({
    codebase: null,
    resolvedPath: null,
    status: 'unconfigured',
    fileCount: 0,
    lastIndexedAt: null,
    warnings: [] as string[],
    codebases: [] as Array<{ name: string; path: string; resolvedPath: string; status: 'missing-path' | 'not-indexed' | 'indexed'; fileCount: number; lastIndexedAt: string | null; primary: boolean; tech?: string }>,
  }),
})

const docs = computed(() => docsData.value?.data ?? [])
const openDocId = ref<string | null>(null)
const docDetail = ref<{ id: string; title: string; doc_type: string; status: string; body: string; updated_at: string; tags: string[] } | null>(null)
const docDetailPending = ref(false)
const docError = ref<string | null>(null)
const docCreateForm = ref({ title: '', doc_type: 'feature', body: '' })
const isCreatingDoc = ref(false)
const issues = computed(() => {
  const rows = issueData.value.issues ?? []
  return issuePriorityFilter.value === 'all'
    ? rows
    : rows.filter((issue) => issue.priority === issuePriorityFilter.value)
})
const agentRaisedIssueCount = computed(() => issues.value.filter((issue) => issue.reportedBy.startsWith('agent-')).length)

const toggleDoc = async (docId: string) => {
  if (openDocId.value === docId) {
    openDocId.value = null
    docDetail.value = null
    return
  }

  docError.value = null
  docDetailPending.value = true
  try {
    const response = await $fetch<{ success: boolean; data: { id: string; title: string; doc_type: string; status: string; body: string; updated_at: string; tags: string[] } }>(`/api/vault/docs/${docId}`)
    openDocId.value = docId
    docDetail.value = response.data
  } catch (error: any) {
    docError.value = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Unable to load document.'
  } finally {
    docDetailPending.value = false
  }
}

const createDoc = async () => {
  if (isCreatingDoc.value || !docCreateForm.value.title.trim()) return
  docError.value = null
  isCreatingDoc.value = true
  try {
    await $fetch('/api/vault/docs', {
      method: 'POST',
      body: {
        title: docCreateForm.value.title.trim(),
        doc_type: docCreateForm.value.doc_type,
        project_id: projectId,
        body: docCreateForm.value.body,
        tags: ['project-doc', projectId],
      },
    })
    docCreateForm.value = { title: '', doc_type: 'feature', body: '' }
    await refreshDocs()
  } catch (error: any) {
    docError.value = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Unable to create document.'
  } finally {
    isCreatingDoc.value = false
  }
}

const createIssue = async () => {
  if (!issueCreateForm.value.title.trim() || isCreatingIssue.value) return
  issueCreateError.value = null
  isCreatingIssue.value = true
  try {
    await $fetch('/api/vault/issues', {
      method: 'POST',
      body: {
        projectId,
        title: issueCreateForm.value.title.trim(),
        problem: issueCreateForm.value.problem.trim() || undefined,
        priority: issueCreateForm.value.priority,
        reportedBy: 'human-user',
      },
    })
    issueCreateForm.value = { title: '', problem: '', priority: 'medium' }
    await refreshIssues()
  } catch (error: any) {
    issueCreateError.value = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Unable to create issue.'
  } finally {
    isCreatingIssue.value = false
  }
}

const linkedTaskSummary = (linkedTaskIds: string[]) => linkedTaskIds
  .map((taskId) => {
    const task = vault.value.tasks.find((entry) => entry.id === taskId)
    return task ? `${task.title} (${task.status})` : taskId
  })

const indexActionError = ref<string | null>(null)
const isIndexingProject = ref(false)
const indexingCodebase = ref<string | null>(null)
const codeSearchQuery = ref('')
const codeSearchHits = ref<Array<{ id: string; title: string; summary: string; sourcePath: string; score: number; codebaseName?: string }>>([])
const codeSearchHint = ref<string | null>(null)
const codeSearchError = ref<string | null>(null)
const isSearchingCode = ref(false)

const codebases = computed(() => project.value?.codebases ?? [])
const hasCodebases = computed(() => codebases.value.length > 0)
const canSearchCode = computed(() => codeSearchQuery.value.trim().length > 0 && hasCodebases.value)

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

const lastIndexedLabel = computed(() => {
  if (!codeIndexStatus.value.lastIndexedAt) return 'Not indexed yet'
  return timeAgo(codeIndexStatus.value.lastIndexedAt)
})

const globalIndexStatus = computed(() => {
  if (codeIndexPending.value) return 'loading'
  return codeIndexStatus.value.status
})

const globalIndexTone = computed(() => {
  switch (globalIndexStatus.value) {
    case 'indexed': return 'bg-emerald-50 text-emerald-700 border-emerald-100'
    case 'missing-path': return 'bg-amber-50 text-amber-700 border-amber-100'
    case 'not-indexed': return 'bg-slate-50 text-slate-700 border-slate-200'
    default: return 'bg-rose-50 text-rose-700 border-rose-100'
  }
})

const globalIndexLabel = computed(() => {
  switch (globalIndexStatus.value) {
    case 'indexed': return 'Indexed'
    case 'missing-path': return 'Path missing'
    case 'not-indexed': return 'Ready to index'
    case 'loading': return '...'
    default: return 'Unconfigured'
  }
})

const codebaseStatusMap = computed(() => new Map((codeIndexStatus.value.codebases ?? []).map((entry) => [entry.name, entry] as const)))

const isCodebaseStale = (lastIndexedAt: string | null) => {
  if (!lastIndexedAt) return false
  return (Date.now() - new Date(lastIndexedAt).getTime()) > 24 * 60 * 60 * 1000
}

const codebaseStatusTone = (name: string) => {
  const status = codebaseStatusMap.value.get(name)
  if (!status) return 'bg-rose-50 text-rose-700 border-rose-100'
  if (status.status === 'indexed' && !isCodebaseStale(status.lastIndexedAt)) return 'bg-emerald-50 text-emerald-700 border-emerald-100'
  if (status.status === 'indexed' && isCodebaseStale(status.lastIndexedAt)) return 'bg-amber-50 text-amber-700 border-amber-100'
  return 'bg-rose-50 text-rose-700 border-rose-100'
}

const codebaseStatusLabel = (name: string) => {
  const status = codebaseStatusMap.value.get(name)
  if (!status) return 'Not Indexed'
  if (status.status === 'indexed' && !isCodebaseStale(status.lastIndexedAt)) return 'Indexed'
  if (status.status === 'indexed' && isCodebaseStale(status.lastIndexedAt)) return 'Stale'
  if (status.status === 'missing-path') return 'Missing Path'
  return 'Not Indexed'
}

const runIndexCodebase = async (codebaseName: string) => {
  if (isIndexingProject.value) return
  indexActionError.value = null
  isIndexingProject.value = true
  indexingCodebase.value = codebaseName
  try {
    await $fetch(`/api/vault/projects/${projectId}/index`, { method: 'POST', body: { codebaseName } })
    await refreshCodeIndexStatus()
  } catch (error: any) {
    indexActionError.value = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Unable to index.'
  } finally {
    isIndexingProject.value = false
    indexingCodebase.value = null
  }
}

const runIndexAll = async () => {
  if (isIndexingProject.value) return
  indexActionError.value = null
  isIndexingProject.value = true
  indexingCodebase.value = 'all'
  try {
    await $fetch(`/api/vault/projects/${projectId}/index`, { method: 'POST' })
    await refreshCodeIndexStatus()
  } catch (error: any) {
    indexActionError.value = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Unable to index.'
  } finally {
    isIndexingProject.value = false
    indexingCodebase.value = null
  }
}

const runCodeSearch = async () => {
  if (!canSearchCode.value || isSearchingCode.value) return
  codeSearchError.value = null
  isSearchingCode.value = true
  try {
    const response = await $fetch<{ hits: Array<{ id: string; title: string; summary: string; sourcePath: string; score: number; codebaseName?: string }>; hint?: string }>(`/api/agent/search-code`, {
      query: { q: codeSearchQuery.value.trim(), projectId },
    })
    codeSearchHits.value = response.hits
    codeSearchHint.value = response.hint ?? null
  } catch (error: any) {
    codeSearchError.value = error?.data?.statusMessage ?? error?.statusMessage ?? error?.message ?? 'Search failed.'
  } finally {
    isSearchingCode.value = false
  }
}
</script>

<template>
  <div class="space-y-8 pb-12">
    <header class="rounded-3xl border border-slate-800/80 bg-slate-950/80 px-6 py-6 shadow-2xl shadow-black/40">
      <div class="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            <NuxtLink to="/projects" class="transition-colors hover:text-emerald-300">Projects</NuxtLink>
            <ChevronRight :size="12" />
            <span>{{ projectId }}</span>
          </div>
          <p class="theme-kicker mt-3 text-[10px] font-bold uppercase">Project</p>
          <h1 class="mt-2 text-4xl font-semibold tracking-tight text-slate-50">{{ summary.name }}</h1>
          <p class="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{{ summary.summary }}</p>
        </div>
        <span class="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">{{ summary.status }}</span>
      </div>
    </header>

    <div class="grid gap-4 md:grid-cols-4">
      <div v-for="metric in summary.metrics" :key="metric.label" class="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 shadow-xl shadow-black/20">
        <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{{ metric.label }}</p>
        <p class="mt-2 text-3xl font-semibold tracking-tight text-slate-50">{{ metric.value }}</p>
        <p class="mt-1 text-xs text-slate-400">{{ metric.note }}</p>
      </div>
    </div>

    <div class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section class="space-y-6">
        <div class="flex items-center gap-4 border-b border-slate-800 pb-2">
          <button class="pb-3 text-xs font-bold uppercase tracking-[0.18em] transition-colors" :class="activeTab === 'workflow' ? 'border-b-2 border-emerald-400 text-emerald-300' : 'text-slate-500 hover:text-slate-300'" @click="activeTab = 'workflow'">Workflow</button>
          <button class="pb-3 text-xs font-bold uppercase tracking-[0.18em] transition-colors" :class="activeTab === 'issues' ? 'border-b-2 border-emerald-400 text-emerald-300' : 'text-slate-500 hover:text-slate-300'" @click="activeTab = 'issues'">Issues</button>
          <button class="pb-3 text-xs font-bold uppercase tracking-[0.18em] transition-colors" :class="activeTab === 'docs' ? 'border-b-2 border-emerald-400 text-emerald-300' : 'text-slate-500 hover:text-slate-300'" @click="activeTab = 'docs'">Docs</button>
        </div>

        <div v-if="activeTab === 'workflow'" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-xl shadow-black/30">
          <p class="theme-kicker text-[10px] font-bold uppercase">Workflow</p>
          <div class="mt-5 space-y-4">
            <div v-for="(step, index) in summary.workflow" :key="step.title" class="rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-4">
              <div class="flex items-start gap-4">
                <div class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-300">{{ index + 1 }}</div>
                <div>
                  <h2 class="text-sm font-semibold text-slate-100">{{ step.title }}</h2>
                  <p class="mt-2 text-sm leading-6 text-slate-400">{{ step.detail }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="activeTab === 'issues'" class="space-y-4">
          <div class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-xl shadow-black/30">
            <p class="theme-kicker text-[10px] font-bold uppercase">Create issue</p>
            <div class="mt-4 space-y-4">
              <input v-model="issueCreateForm.title" placeholder="Issue title" class="theme-input w-full rounded-2xl px-4 py-3 text-sm" />
              <textarea v-model="issueCreateForm.problem" rows="4" placeholder="Describe the problem" class="theme-input w-full rounded-2xl px-4 py-3 text-sm"></textarea>
              <div class="flex items-center gap-3">
                <select v-model="issueCreateForm.priority" class="theme-input rounded-2xl px-4 py-3 text-sm">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <button class="theme-button-primary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" :disabled="isCreatingIssue" @click="createIssue">{{ isCreatingIssue ? 'Creating...' : 'Create Issue' }}</button>
              </div>
              <p v-if="issueCreateError" class="text-sm text-rose-400">{{ issueCreateError }}</p>
            </div>
          </div>

          <div v-if="issuesPending" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 text-sm text-slate-400 shadow-xl shadow-black/30">Loading issues...</div>
          <div v-else-if="issues.length === 0" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 text-sm text-slate-400 shadow-xl shadow-black/30">No issues for this project yet.</div>
          <div v-else class="space-y-3">
            <NuxtLink v-for="issue in issues" :key="issue.id" :to="`/issues/${issue.id}`" class="block rounded-3xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-xl shadow-black/30 transition-all hover:border-emerald-500/40">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-lg font-semibold tracking-tight text-slate-100">{{ issue.title }}</span>
                    <span class="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">{{ issue.status }}</span>
                    <span class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">{{ issue.priority }}</span>
                  </div>
                  <p class="mt-2 text-sm text-slate-400">Reported by {{ issue.reportedBy }} • {{ timeAgo(issue.createdAt) }}</p>
                  <p v-if="issue.linkedTaskIds.length > 0" class="mt-2 text-xs text-slate-500">Linked tasks: {{ linkedTaskSummary(issue.linkedTaskIds).join(', ') }}</p>
                </div>
                <ChevronRight :size="16" class="text-slate-500" />
              </div>
            </NuxtLink>
          </div>
        </div>

        <div v-else class="space-y-4">
          <div class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 shadow-xl shadow-black/30">
            <p class="theme-kicker text-[10px] font-bold uppercase">New doc</p>
            <div class="mt-4 space-y-4">
              <input v-model="docCreateForm.title" placeholder="Document title" class="theme-input w-full rounded-2xl px-4 py-3 text-sm" />
              <select v-model="docCreateForm.doc_type" class="theme-input w-full rounded-2xl px-4 py-3 text-sm">
                <option value="feature">Feature</option>
                <option value="design">Design</option>
                <option value="adr">ADR</option>
                <option value="research">Research</option>
                <option value="runbook">Runbook</option>
                <option value="general">General</option>
              </select>
              <textarea v-model="docCreateForm.body" rows="6" placeholder="Write markdown content" class="theme-input w-full rounded-2xl px-4 py-3 text-sm"></textarea>
              <button class="theme-button-primary rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" :disabled="isCreatingDoc" @click="createDoc">{{ isCreatingDoc ? 'Creating...' : 'Create Doc' }}</button>
              <p v-if="docError" class="text-sm text-rose-400">{{ docError }}</p>
            </div>
          </div>

          <div v-if="docsPending" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-6 text-sm text-slate-400 shadow-xl shadow-black/30">Loading docs...</div>
          <EmptyState v-else-if="docs.length === 0" title="No project docs yet" description="Create a project-scoped doc to capture feature context, design decisions, or research without leaving this page." />
          <div v-else class="space-y-3">
            <div v-for="doc in docs" :key="doc.id" class="rounded-3xl border border-slate-800/80 bg-slate-950/70 p-5 shadow-xl shadow-black/30">
              <button class="w-full text-left" @click="toggleDoc(doc.id)">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-lg font-semibold tracking-tight text-slate-100">{{ doc.title }}</span>
                      <span class="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300">{{ doc.doc_type }}</span>
                      <span class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">{{ doc.status }}</span>
                    </div>
                    <p class="mt-2 text-sm text-slate-400">Updated {{ timeAgo(doc.updated_at) }}</p>
                  </div>
                  <ChevronRight :size="16" class="text-slate-500" />
                </div>
              </button>
              <div v-if="openDocId === doc.id" class="mt-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm leading-6 text-slate-300 whitespace-pre-wrap">
                <div v-if="docDetailPending">Loading document...</div>
                <div v-else-if="docDetail && docDetail.id === doc.id">{{ docDetail.body }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside class="space-y-6">
        <div class="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/30">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="theme-kicker text-[10px] font-bold uppercase">Code index</p>
              <h2 class="mt-2 text-xl font-semibold tracking-tight text-slate-50">Project codebases</h2>
            </div>
            <span class="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider" :class="globalIndexTone">{{ globalIndexLabel }}</span>
          </div>

          <div v-if="hasCodebases" class="mt-4 space-y-3">
            <div v-for="cb in codebases" :key="cb.name" class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <GitBranch :size="14" class="text-emerald-300" />
                    <span class="text-sm font-semibold text-slate-100">{{ cb.name }}</span>
                    <span v-if="cb.primary" class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Primary</span>
                  </div>
                  <p class="mt-2 truncate text-xs font-mono text-slate-500">{{ cb.path }}</p>
                </div>
                <button class="theme-button-secondary rounded-2xl px-3 py-2 text-[11px] font-bold uppercase tracking-wider" :disabled="isIndexingProject" @click="runIndexCodebase(cb.name)">
                  <RotateCw :size="13" class="mr-2 inline-flex" :class="indexingCodebase === cb.name ? 'animate-spin' : ''" />
                  {{ indexingCodebase === cb.name ? 'Indexing...' : 'Reindex' }}
                </button>
              </div>

              <div class="mt-3 flex items-center justify-between gap-3 text-xs">
                <span class="rounded-full border px-2 py-1 font-bold uppercase tracking-wider" :class="codebaseStatusTone(cb.name)">{{ codebaseStatusLabel(cb.name) }}</span>
                <span class="text-slate-500">{{ codebaseStatusMap.get(cb.name)?.fileCount ?? 0 }} files • {{ codebaseStatusMap.get(cb.name)?.lastIndexedAt ? timeAgo(codebaseStatusMap.get(cb.name)!.lastIndexedAt!) : 'Never indexed' }}</span>
              </div>
            </div>

            <button class="theme-button-primary w-full rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" :disabled="isIndexingProject" @click="runIndexAll">{{ indexingCodebase === 'all' ? 'Indexing all...' : 'Index All' }}</button>
          </div>

          <div v-else class="mt-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-sm text-slate-500">
            No codebases configured. Add `codebases[]` to the project record to unlock indexing and code search.
          </div>

          <p v-if="indexActionError" class="mt-4 text-sm text-rose-400">{{ indexActionError }}</p>
          <div v-if="codeIndexStatus.warnings?.length" class="mt-4 space-y-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
            <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">Index warnings</p>
            <p v-for="warning in codeIndexStatus.warnings" :key="warning" class="text-sm text-amber-200">{{ warning }}</p>
          </div>

          <div class="mt-5 border-t border-slate-800 pt-5">
            <div class="relative">
              <Search class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input v-model="codeSearchQuery" type="text" placeholder="Search indexed code" class="theme-input w-full rounded-2xl py-3 pl-11 pr-4 text-sm" @keyup.enter="runCodeSearch" />
            </div>
            <button class="theme-button-secondary mt-3 w-full rounded-2xl px-4 py-2 text-xs font-bold uppercase tracking-wider" :disabled="!canSearchCode || isSearchingCode" @click="runCodeSearch">{{ isSearchingCode ? 'Searching...' : 'Search' }}</button>
            <p v-if="codeSearchError" class="mt-3 text-sm text-rose-400">{{ codeSearchError }}</p>
            <p v-else-if="codeSearchHint && codeSearchHits.length === 0" class="mt-3 text-sm text-slate-500">{{ codeSearchHint }}</p>
            <div v-if="codeSearchHits.length > 0" class="mt-4 space-y-3">
              <div v-for="hit in codeSearchHits" :key="hit.id" class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <div class="flex items-center gap-2">
                  <p class="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{{ hit.title }}</p>
                  <span v-if="hit.codebaseName" class="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">{{ hit.codebaseName }}</span>
                </div>
                <p class="mt-2 truncate text-[11px] font-mono text-slate-500">{{ hit.sourcePath }}</p>
                <p class="mt-2 text-sm leading-6 text-slate-400">{{ hit.summary }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-5 shadow-xl shadow-black/30">
          <p class="theme-kicker text-[10px] font-bold uppercase">Linked surfaces</p>
          <div class="mt-4 space-y-3">
            <NuxtLink v-for="link in summary.links" :key="link.href" :to="link.href" class="block rounded-2xl border border-slate-800 bg-slate-900/80 p-4 transition-colors hover:border-emerald-500/40">
              <p class="text-sm font-semibold text-slate-100">{{ link.label }}</p>
              <p class="mt-2 text-sm text-slate-400">{{ link.note }}</p>
            </NuxtLink>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
