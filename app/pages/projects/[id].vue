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
  <div class="max-w-4xl mx-auto space-y-8 pb-16">
    <!-- Header -->
    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div class="space-y-2">
        <div class="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
          <NuxtLink to="/projects" class="hover:text-violet-600 transition-colors">Projects</NuxtLink>
          <ChevronRight :size="12" />
          <span class="text-violet-600">{{ projectId }}</span>
        </div>
        <h1 class="text-4xl font-bold tracking-tight text-slate-950">{{ summary.name }}</h1>
        <p class="text-slate-500 text-sm max-w-2xl">{{ summary.summary }}</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="px-3 py-1.5 rounded-lg text-xs font-bold uppercase border bg-slate-50 border-slate-200 text-slate-600">
          {{ summary.status }}
        </span>
      </div>
    </header>

    <!-- Metrics -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div v-for="metric in summary.metrics" :key="metric.label" class="glass-card p-5">
        <div class="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{{ metric.label }}</div>
        <div class="text-3xl font-black text-slate-900 tracking-tight mb-1">{{ metric.value }}</div>
        <div class="text-xs text-slate-500">{{ metric.note }}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <!-- Main Content -->
      <div class="md:col-span-2 space-y-8">

        <div class="flex items-center gap-6 border-b border-slate-200 pb-2">
          <button class="pb-3 text-xs font-bold uppercase tracking-widest transition-colors" :class="activeTab === 'workflow' ? 'text-violet-600 border-b-2 border-violet-600' : 'text-slate-400 hover:text-slate-600'" @click="activeTab = 'workflow'">Workflow</button>
          <button class="pb-3 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2" :class="activeTab === 'issues' ? 'text-violet-600 border-b-2 border-violet-600' : 'text-slate-400 hover:text-slate-600'" @click="activeTab = 'issues'">
            Issues
            <span class="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px]">{{ issues.length }}</span>
            <span v-if="agentRaisedIssueCount > 0" class="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px]">{{ agentRaisedIssueCount }} agent</span>
          </button>
          <button class="pb-3 text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2" :class="activeTab === 'docs' ? 'text-violet-600 border-b-2 border-violet-600' : 'text-slate-400 hover:text-slate-600'" @click="activeTab = 'docs'">
            Docs
            <span class="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px]">{{ docs.length }}</span>
          </button>
        </div>

        <div v-if="activeTab === 'workflow'" class="glass-card p-6 md:p-8 space-y-6">
          <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Activity :size="20" class="text-violet-600" />
            Project Workflow
          </h2>
          <div class="relative">
            <div class="absolute left-[15px] top-4 bottom-4 w-0.5 bg-slate-100"></div>
            <div class="space-y-8">
              <div v-for="(step, index) in summary.workflow" :key="step.title" class="relative pl-10">
                <div class="absolute left-0 w-8 h-8 rounded-full bg-white border-2 border-violet-100 flex items-center justify-center text-xs font-bold text-violet-600 z-10 shadow-sm">
                  {{ index + 1 }}
                </div>
                <div>
                  <h3 class="text-sm font-bold text-slate-900 mb-1">{{ step.title }}</h3>
                  <p class="text-sm text-slate-600 leading-relaxed">{{ step.detail }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="activeTab === 'issues'" class="glass-card p-6 md:p-8 space-y-6">
          <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle :size="20" class="text-violet-600" />
                Project Issues
              </h2>
              <p class="text-sm text-slate-500 mt-1">Discuss problems and observations before they graduate into implementation tasks.</p>
            </div>
            <div class="flex gap-2">
              <select v-model="issueStatusFilter" class="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700">
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
                <option value="wont-fix">Won't fix</option>
              </select>
              <select v-model="issuePriorityFilter" class="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700">
                <option value="all">All priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-4">
            <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
              <Plus :size="14" />
              Create Issue
            </div>
            <input v-model="issueCreateForm.title" type="text" placeholder="Issue title" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" />
            <textarea v-model="issueCreateForm.problem" rows="4" placeholder="Describe the problem" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"></textarea>
            <div class="flex items-center justify-between gap-3">
              <select v-model="issueCreateForm.priority" class="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <button @click="createIssue" :disabled="isCreatingIssue" class="px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-bold hover:bg-violet-700 disabled:opacity-50">{{ isCreatingIssue ? 'Creating...' : 'Create Issue' }}</button>
            </div>
            <p v-if="issueCreateError" class="text-xs text-rose-600">{{ issueCreateError }}</p>
          </div>

          <div v-if="issuesPending" class="text-sm text-slate-500">Loading issues...</div>
          <div v-else-if="issues.length === 0" class="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">No issues for this project yet.</div>
          <div v-else class="space-y-3">
            <NuxtLink v-for="issue in issues" :key="issue.id" :to="`/issues/${issue.id}`" class="block rounded-2xl border border-slate-100 bg-white p-4 hover:border-violet-200 hover:bg-violet-50/30 transition-colors">
              <div class="flex items-start justify-between gap-4">
                <div class="space-y-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-bold text-slate-900">{{ issue.title }}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">{{ issue.status }}</span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-100 text-violet-700">{{ issue.priority }}</span>
                  </div>
                  <p class="text-xs text-slate-500">Reported by {{ issue.reportedBy }} • {{ timeAgo(issue.createdAt) }}</p>
                  <p v-if="issue.linkedTaskIds.length > 0" class="text-xs text-slate-500">Linked tasks: {{ linkedTaskSummary(issue.linkedTaskIds).join(', ') }}</p>
                </div>
                <ChevronRight :size="16" class="text-slate-400 shrink-0" />
              </div>
            </NuxtLink>
          </div>
        </div>

        <div v-else class="glass-card p-6 md:p-8 space-y-6">
          <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText :size="20" class="text-violet-600" />
                Project Docs
              </h2>
              <p class="text-sm text-slate-500 mt-1">Feature docs, design notes, ADRs, and research linked to this project.</p>
            </div>
          </div>

          <div class="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 space-y-4">
            <div class="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
              <Plus :size="14" />
              New Doc
            </div>
            <input v-model="docCreateForm.title" type="text" placeholder="Document title" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" />
            <select v-model="docCreateForm.doc_type" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700">
              <option value="feature">Feature</option>
              <option value="design">Design</option>
              <option value="adr">ADR</option>
              <option value="research">Research</option>
              <option value="runbook">Runbook</option>
              <option value="general">General</option>
            </select>
            <textarea v-model="docCreateForm.body" rows="6" placeholder="Write markdown content" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"></textarea>
            <div class="flex items-center justify-end gap-3">
              <button @click="createDoc" :disabled="isCreatingDoc" class="px-4 py-2 bg-violet-600 text-white rounded-lg text-xs font-bold hover:bg-violet-700 disabled:opacity-50">{{ isCreatingDoc ? 'Creating...' : 'Create Doc' }}</button>
            </div>
            <p v-if="docError" class="text-xs text-rose-600">{{ docError }}</p>
          </div>

          <div v-if="docsPending" class="text-sm text-slate-500">Loading docs...</div>
          <EmptyState
            v-else-if="docs.length === 0"
            title="No project docs yet"
            description="Create a project-scoped doc to capture feature context, design decisions, or research without leaving this page."
          />
          <div v-else class="space-y-3">
            <div v-for="doc in docs" :key="doc.id" class="rounded-2xl border border-slate-100 bg-white p-4">
              <button class="w-full text-left" @click="toggleDoc(doc.id)">
                <div class="flex items-start justify-between gap-4">
                  <div class="space-y-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-sm font-bold text-slate-900">{{ doc.title }}</span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">{{ doc.doc_type }}</span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-violet-100 text-violet-700">{{ doc.status }}</span>
                    </div>
                    <p class="text-xs text-slate-500">Updated {{ timeAgo(doc.updated_at) }}</p>
                  </div>
                  <ChevronRight :size="16" class="text-slate-400 shrink-0" />
                </div>
              </button>
              <div v-if="openDocId === doc.id" class="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-4">
                <div v-if="docDetailPending" class="text-sm text-slate-500">Loading document...</div>
                <div v-else-if="docDetail && docDetail.id === doc.id" class="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700">{{ docDetail.body }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Aside -->
      <div class="space-y-6">

        <!-- Code Index -->
        <div class="glass-card p-6 space-y-4">
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database :size="16" class="text-violet-600" />
              Code Index
            </h2>
            <span class="px-2 py-1 rounded text-[10px] font-bold uppercase border" :class="globalIndexTone">
              {{ globalIndexLabel }}
            </span>
          </div>

          <!-- Multi-codebase list -->
          <div v-if="hasCodebases" class="space-y-2">
            <div
              v-for="cb in codebases"
              :key="cb.name"
              class="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3 space-y-2"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="px-2 py-1 rounded text-[10px] font-bold uppercase border" :class="codebaseStatusTone(cb.name)">
                  {{ codebaseStatusLabel(cb.name) }}
                </span>
                <span class="text-[10px] text-slate-400">{{ codebaseStatusMap.get(cb.name)?.lastIndexedAt ? timeAgo(codebaseStatusMap.get(cb.name)!.lastIndexedAt!) : 'Never indexed' }}</span>
              </div>
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <GitBranch :size="13" class="text-violet-500 shrink-0" />
                  <span class="text-xs font-bold text-slate-900 truncate">{{ cb.name }}</span>
                  <span v-if="cb.primary" class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-violet-100 text-violet-700">primary</span>
                  <span v-if="cb.tech" class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-100 text-slate-500">{{ cb.tech }}</span>
                </div>
                <button
                  @click="runIndexCodebase(cb.name)"
                  :disabled="isIndexingProject"
                  class="shrink-0 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors flex items-center gap-1"
                >
                  <RotateCw :size="11" :class="indexingCodebase === cb.name ? 'animate-spin' : ''" />
                  {{ indexingCodebase === cb.name ? 'Indexing...' : 'Index' }}
                </button>
              </div>
              <p class="text-[10px] font-mono text-slate-400 truncate" :title="cb.path">{{ cb.path }}</p>
              <p class="text-[11px] text-slate-500">{{ codebaseStatusMap.get(cb.name)?.fileCount ?? 0 }} indexed files</p>
            </div>

            <button
              @click="runIndexAll"
              :disabled="isIndexingProject"
              class="w-full mt-1 px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <RotateCw :size="13" :class="indexingCodebase === 'all' ? 'animate-spin' : ''" />
              {{ indexingCodebase === 'all' ? 'Indexing all...' : 'Index All' }}
            </button>
          </div>

          <!-- No codebases configured -->
          <div v-else class="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center space-y-1">
            <p class="text-xs font-bold text-slate-500">No codebases configured</p>
            <p class="text-[11px] text-slate-400">Add <code class="bg-slate-100 px-1 rounded">codebases[]</code> to the project vault file or create the project with repo paths from the workflow surfaces.</p>
          </div>

          <!-- Stats row -->
          <div class="grid grid-cols-2 gap-3 text-xs text-slate-600">
            <div class="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3">
              <p class="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Indexed files</p>
              <p class="mt-1 text-lg font-bold text-slate-900">{{ codeIndexPending ? '...' : codeIndexStatus.fileCount }}</p>
            </div>
            <div class="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3">
              <p class="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Last indexed</p>
              <p class="mt-1 text-sm font-bold text-slate-900">{{ codeIndexPending ? '...' : lastIndexedLabel }}</p>
            </div>
          </div>

          <p v-if="indexActionError" class="text-[11px] text-rose-600">{{ indexActionError }}</p>
          <div v-if="codeIndexStatus.warnings?.length" class="space-y-1 rounded-xl border border-amber-100 bg-amber-50 px-3 py-3">
            <p class="text-[10px] font-bold uppercase tracking-widest text-amber-700">Index warnings</p>
            <p v-for="warning in codeIndexStatus.warnings" :key="warning" class="text-[11px] text-amber-700">{{ warning }}</p>
          </div>

          <!-- Code search -->
          <div class="border-t border-slate-100 pt-4 space-y-3">
            <div class="flex gap-2">
              <div class="relative flex-1">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" :size="14" />
                <input
                  v-model="codeSearchQuery"
                  type="text"
                  placeholder="Search indexed code..."
                  class="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
                  @keyup.enter="runCodeSearch"
                />
              </div>
              <button
                @click="runCodeSearch"
                :disabled="!canSearchCode || isSearchingCode"
                class="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                {{ isSearchingCode ? '...' : 'Search' }}
              </button>
            </div>

            <p v-if="codeSearchError" class="text-[11px] text-rose-600">{{ codeSearchError }}</p>
            <p v-else-if="codeSearchHint && codeSearchHits.length === 0" class="text-[11px] text-slate-500">{{ codeSearchHint }}</p>
            <p v-else-if="codeSearchQuery && !isSearchingCode && codeSearchHits.length === 0" class="text-[11px] text-slate-500">No hits for this project.</p>

            <div v-if="codeSearchHits.length > 0" class="space-y-2">
              <div v-for="hit in codeSearchHits" :key="hit.id" class="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3">
                <div class="flex items-center gap-2 mb-1">
                  <p class="text-xs font-bold text-slate-900 truncate flex-1">{{ hit.title }}</p>
                  <span v-if="hit.codebaseName" class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-100 text-violet-700 shrink-0">{{ hit.codebaseName }}</span>
                </div>
                <p class="text-[10px] font-mono text-slate-400 truncate">{{ hit.sourcePath }}</p>
                <p class="mt-1 text-xs text-slate-600 leading-relaxed">{{ hit.summary }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Related Documents -->
        <div class="glass-card p-6">
          <h2 class="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <FileText :size="16" class="text-violet-600" />
            Related Documents
          </h2>
          <div class="space-y-1">
            <NuxtLink
              v-for="link in summary.links"
              :key="link.label"
              :to="link.href"
              class="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group"
            >
              <div class="mt-0.5 w-6 h-6 rounded bg-slate-100 flex items-center justify-center shrink-0">
                <FileText :size="12" class="text-slate-400 group-hover:text-violet-600 transition-colors" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-bold text-slate-900 group-hover:text-violet-600 transition-colors line-clamp-1">{{ link.label }}</p>
                <p class="text-xs text-slate-500 line-clamp-1">{{ link.note }}</p>
              </div>
            </NuxtLink>

            <div v-if="summary.links.length === 0 && docs.length === 0" class="text-sm text-slate-500 text-center py-4">
              No documents linked yet.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
