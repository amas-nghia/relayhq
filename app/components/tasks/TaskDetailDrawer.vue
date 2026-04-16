<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { relayhqReadModelKey } from "../../data/relayhq-overview";
import type { TaskWorkflowRecord } from "../../data/task-workflow";
import type { ApprovalOutcome } from "../../shared/vault/schema";
import type { TaskColumn, TaskStatus } from "../../shared/vault/schema";

const props = defineProps<{
  readonly task: TaskWorkflowRecord;
}>();

type MutableTaskStatus = Exclude<TaskStatus, "cancelled">;
type TaskDetailPatch = {
  readonly column: TaskColumn;
  readonly status: MutableTaskStatus;
  readonly approval_needed?: boolean;
  readonly approval_requested_by?: string | null;
  readonly approval_reason?: string | null;
  readonly approval_outcome?: ApprovalOutcome;
  readonly approved_by?: string | null;
  readonly approved_at?: string | null;
};

const columnLabels: ReadonlyArray<{ readonly value: TaskColumn; readonly label: string }> = [
  { value: "todo", label: "Todo" },
  { value: "in-progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];

const statusLabels: ReadonlyArray<{ readonly value: MutableTaskStatus; readonly label: string }> = [
  { value: "todo", label: "Todo" },
  { value: "in-progress", label: "In progress" },
  { value: "waiting-approval", label: "Waiting approval" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

const selectedStatus = ref<MutableTaskStatus>(props.task.status === "cancelled" ? "todo" : (props.task.status as MutableTaskStatus));
const reviewReason = ref(props.task.approvalState.reason ?? "");
const pendingAction = ref<"column" | "status" | null>(null);
const errorMessage = ref("");

const actorId = computed(() => props.task.lockedBy ?? props.task.createdBy ?? props.task.assignee);

watch(
  () => props.task.status,
  (status) => {
    selectedStatus.value = status === "cancelled" ? "todo" : (status as MutableTaskStatus);
  },
);

watch(
  () => props.task.approvalState.reason,
  (reason) => {
    reviewReason.value = reason ?? "";
  },
);

function statusForColumn(column: TaskColumn): MutableTaskStatus {
  switch (column) {
    case "todo":
      return "todo";
    case "in-progress":
      return "in-progress";
    case "review":
      return "waiting-approval";
    case "done":
      return "done";
  }
}

function columnForStatus(status: MutableTaskStatus): TaskColumn {
  switch (status) {
    case "todo":
      return "todo";
    case "in-progress":
      return "in-progress";
    case "waiting-approval":
    case "blocked":
      return "review";
    case "done":
      return "done";
  }
}

function readErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    if ("data" in error && typeof (error as { readonly data?: { readonly statusMessage?: string } }).data?.statusMessage === "string") {
      return (error as { readonly data: { readonly statusMessage: string } }).data.statusMessage;
    }

    if ("statusMessage" in error && typeof (error as { readonly statusMessage?: string }).statusMessage === "string") {
      return (error as { readonly statusMessage: string }).statusMessage;
    }
  }

  return error instanceof Error ? error.message : "Unable to update the task right now.";
}

function buildPatch(column: TaskColumn, status: MutableTaskStatus): TaskDetailPatch {
  return {
    column,
    status,
    approval_needed: false,
    approval_requested_by: null,
    approval_reason: null,
    approval_outcome: "pending",
    approved_by: null,
    approved_at: null,
  };
}

async function submitPatch(patch: TaskDetailPatch, kind: "column" | "status"): Promise<void> {
  pendingAction.value = kind;
  errorMessage.value = "";

  try {
    await $fetch(`/api/vault/tasks/${props.task.id}`, {
      method: "PATCH",
      body: {
        actorId: actorId.value,
        patch,
      },
    });
    await refreshNuxtData(relayhqReadModelKey);
  } catch (error) {
    errorMessage.value = readErrorMessage(error);
  } finally {
    pendingAction.value = null;
  }
}

async function requestApproval(kind: "column" | "status"): Promise<void> {
  pendingAction.value = kind;
  errorMessage.value = "";

  try {
    await $fetch(`/api/vault/tasks/${props.task.id}/request-approval`, {
      method: "POST",
      body: {
        actorId: actorId.value,
        reason: reviewReason.value.trim().length > 0 ? reviewReason.value.trim() : "Task moved to review from task detail.",
      },
    });
    await refreshNuxtData(relayhqReadModelKey);
  } catch (error) {
    errorMessage.value = readErrorMessage(error);
  } finally {
    pendingAction.value = null;
  }
}

async function moveToColumn(column: TaskColumn): Promise<void> {
  if (column === props.task.column && statusForColumn(column) === props.task.status) {
    return;
  }

  if (column === "review") {
    await requestApproval("column");
    return;
  }

  await submitPatch(buildPatch(column, statusForColumn(column)), "column");
}

async function updateStatus(): Promise<void> {
  if (selectedStatus.value === "waiting-approval") {
    await requestApproval("status");
    return;
  }

  await submitPatch(buildPatch(columnForStatus(selectedStatus.value), selectedStatus.value), "status");
}
</script>

<template>
  <aside class="drawer-card" aria-labelledby="task-detail-title">
    <header class="drawer-header">
      <div class="drawer-copy">
        <p class="eyebrow">Task detail drawer</p>
        <h2 id="task-detail-title" class="drawer-title">{{ task.title }}</h2>
        <p class="drawer-text">{{ task.summary }}</p>
      </div>

      <div class="drawer-status" aria-label="Task state badges">
        <span v-if="task.isStale" class="status-pill stale">Stale</span>
        <span class="status-pill" :data-state="task.status">{{ task.status }}</span>
        <span class="status-pill subtle" :data-state="task.approvalState.status">
          {{ task.approvalState.status }}
        </span>
      </div>
    </header>

    <section class="drawer-section" aria-labelledby="task-controls-heading">
      <div class="section-header">
        <p class="section-kicker">Task controls</p>
        <h3 id="task-controls-heading">Column and status updates</h3>
      </div>

      <div class="controls-grid">
        <article class="info-card">
          <h4>Move across board columns</h4>
          <p class="control-copy">Column moves stay aligned with the matching lifecycle status and refresh in place without changing the current route.</p>
          <div class="button-group" role="group" aria-label="Move task between columns">
            <button
              v-for="column in columnLabels"
              :key="column.value"
              type="button"
              class="action-button"
              :class="{ active: task.column === column.value }"
              :disabled="pendingAction !== null"
              @click="moveToColumn(column.value)"
            >
              {{ column.label }}
            </button>
          </div>
        </article>

        <article class="info-card">
          <h4>Update task status</h4>
          <p class="control-copy">Status changes use the lifecycle API and keep the board column consistent with the selected control-plane state.</p>
          <form class="status-form" @submit.prevent="updateStatus">
            <label class="field-label" for="task-status-select">Status</label>
            <div class="status-row">
              <select id="task-status-select" v-model="selectedStatus" class="status-select" :disabled="pendingAction !== null">
                <option v-for="status in statusLabels" :key="status.value" :value="status.value">{{ status.label }}</option>
              </select>
              <button type="submit" class="action-button primary" :disabled="pendingAction !== null">Apply</button>
            </div>
            <label class="field-label" for="task-review-reason">Review reason</label>
            <textarea
              id="task-review-reason"
              v-model="reviewReason"
              class="reason-input"
              rows="3"
              :disabled="pendingAction !== null"
              placeholder="Required when moving into review or waiting-approval."
            ></textarea>
          </form>
        </article>
      </div>

      <p v-if="errorMessage" class="error-text" role="alert">{{ errorMessage }}</p>
    </section>

    <section class="drawer-section" aria-labelledby="task-record-heading">
      <div class="section-header">
        <p class="section-kicker">Vault record</p>
        <h3 id="task-record-heading">Canonical task fields</h3>
      </div>

      <dl class="detail-list">
        <div>
          <dt>Task id</dt>
          <dd>{{ task.id }}</dd>
        </div>
        <div>
          <dt>Source file</dt>
          <dd>{{ task.sourcePath }}</dd>
        </div>
        <div>
          <dt>Workspace</dt>
          <dd>{{ task.workspaceName }}</dd>
        </div>
        <div>
          <dt>Project</dt>
          <dd>{{ task.projectName }}</dd>
        </div>
        <div>
          <dt>Board / column</dt>
          <dd>{{ task.boardName }} / {{ task.column }}</dd>
        </div>
        <div>
          <dt>Assignee</dt>
          <dd>{{ task.assignee }}</dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>{{ task.priority }}</dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd>{{ task.progress }}%</dd>
        </div>
      </dl>
    </section>

    <section class="drawer-section" aria-labelledby="coordination-heading">
      <div class="section-header">
        <p class="section-kicker">Coordination state</p>
        <h3 id="coordination-heading">Visible control-plane facts</h3>
      </div>

      <div class="info-grid">
        <article class="info-card">
          <h4>Dependencies</h4>
          <ul class="chip-list" role="list">
            <li v-if="task.dependsOn.length === 0" class="chip muted">None</li>
            <li v-for="dependency in task.dependsOn" :key="dependency" class="chip">{{ dependency }}</li>
          </ul>
        </article>

        <article class="info-card">
          <h4>Tags</h4>
          <ul class="chip-list" role="list">
            <li v-if="task.tags.length === 0" class="chip muted">None</li>
            <li v-for="tag in task.tags" :key="tag" class="chip">{{ tag }}</li>
          </ul>
        </article>

        <article class="info-card">
          <h4>Linked threads</h4>
          <ul class="thread-list" role="list">
            <li v-for="link in task.links" :key="`${link.projectId}-${link.threadId}`">
              <strong>{{ link.projectId }}</strong>
              <span>{{ link.threadId }}</span>
            </li>
          </ul>
        </article>

        <article class="info-card">
          <h4>Lock window</h4>
          <dl class="mini-list">
            <div>
              <dt>Locked by</dt>
              <dd>{{ task.lockedBy ?? "Unlocked" }}</dd>
            </div>
            <div>
              <dt>Locked at</dt>
              <dd>{{ task.lockedAt ?? "—" }}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{{ task.lockExpiresAt ?? "—" }}</dd>
            </div>
          </dl>
        </article>

        <article v-if="task.blockedReason" class="info-card">
          <h4>Blocker</h4>
          <dl class="mini-list">
            <div>
              <dt>Reason</dt>
              <dd>{{ task.blockedReason }}</dd>
            </div>
            <div>
              <dt>Since</dt>
              <dd>{{ task.blockedSince ?? "—" }}</dd>
            </div>
          </dl>
        </article>
      </div>

      <article class="boundary-card">
        <h4>Boundary note</h4>
        <p>
          This drawer keeps the task record inside the control plane and intentionally leaves out
          heartbeat, execution notes, and other runtime details.
        </p>
      </article>
    </section>

    <section class="drawer-section" aria-labelledby="audit-notes-heading">
      <div class="section-header">
        <p class="section-kicker">Audit trail</p>
        <h3 id="audit-notes-heading">Shared audit notes</h3>
      </div>

      <ul class="audit-list" role="list">
        <li v-if="task.auditNotes.length === 0" class="audit-card muted">
          <strong>No audit notes recorded</strong>
          <p>The shared vault does not have an audit note for this task yet.</p>
        </li>
        <li v-for="auditNote in task.auditNotes" :key="auditNote.id" class="audit-card">
          <div class="audit-topline">
            <strong>{{ auditNote.id }}</strong>
            <span class="chip muted">{{ auditNote.createdAt }}</span>
          </div>
          <p>{{ auditNote.message }}</p>
          <dl class="mini-list audit-meta">
            <div>
              <dt>Source</dt>
              <dd>{{ auditNote.source }}</dd>
            </div>
            <div>
              <dt>Confidence</dt>
              <dd>{{ Math.round(auditNote.confidence * 100) }}%</dd>
            </div>
          </dl>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.drawer-card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.drawer-header,
.drawer-section,
.section-header,
.info-card,
.boundary-card {
  display: grid;
  gap: 0.75rem;
}

.drawer-copy {
  display: grid;
  gap: 0.5rem;
}

.eyebrow,
.section-kicker,
.detail-list dt,
.mini-list dt {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

.drawer-title,
.section-header h3,
.info-card h4,
.boundary-card h4 {
  margin: 0;
  letter-spacing: -0.04em;
  color: #0f172a;
}

.drawer-title {
  font-size: clamp(1.5rem, 2.8vw, 2.2rem);
  line-height: 1.08;
}

.drawer-text,
.info-card span,
.boundary-card p,
.detail-list dd,
.mini-list dd {
  margin: 0;
  color: #475569;
  line-height: 1.55;
}

.drawer-status {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid rgba(124, 58, 237, 0.18);
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.08);
  color: #4c1d95;
  font-size: 0.875rem;
  font-weight: 700;
  white-space: nowrap;
}

.status-pill.subtle {
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(248, 250, 252, 0.95);
  color: #334155;
}

.status-pill.stale {
  border-color: rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.12);
  color: #991b1b;
}

.status-pill[data-state="waiting-approval"],
.status-pill[data-state="pending"] {
  border-color: rgba(245, 158, 11, 0.2);
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
}

.status-pill[data-state="not-needed"] {
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(248, 250, 252, 0.95);
  color: #475569;
}

.status-pill[data-state="approved"],
.status-pill[data-state="done"] {
  border-color: rgba(16, 185, 129, 0.2);
  background: rgba(16, 185, 129, 0.12);
  color: #065f46;
}

.status-pill[data-state="blocked"] {
  border-color: rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.12);
  color: #991b1b;
}

.detail-list,
.mini-list,
.chip-list,
.thread-list,
.audit-list {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
}

.controls-grid,
.status-form,
.audit-card {
  display: grid;
  gap: 0.75rem;
}

.button-group,
.status-row,
.audit-topline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.button-group,
.audit-topline {
  align-items: center;
  justify-content: space-between;
}

.action-button,
.status-select,
.reason-input {
  min-height: 2.5rem;
  padding: 0.625rem 0.875rem;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.9rem;
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  font: inherit;
}

.action-button {
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.action-button:hover,
.action-button:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(124, 58, 237, 0.24);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.action-button.active,
.action-button.primary {
  border-color: rgba(124, 58, 237, 0.18);
  background: rgba(124, 58, 237, 0.08);
  color: #4c1d95;
}

.action-button:disabled,
.status-select:disabled,
.reason-input:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.status-row {
  align-items: center;
}

.status-select {
  flex: 1 1 14rem;
}

.reason-input {
  width: 100%;
  resize: vertical;
}

.field-label,
.control-copy,
.error-text {
  margin: 0;
  color: #475569;
}

.field-label {
  font-size: 0.875rem;
  font-weight: 700;
  color: #0f172a;
}

.error-text {
  color: #991b1b;
}

.audit-list {
  padding: 0;
}

.audit-card {
  padding: 1rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.95);
}

.audit-card.muted {
  opacity: 0.9;
}

.audit-meta {
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
}

.detail-list div,
.mini-list div,
.info-card,
.boundary-card {
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.95);
}

.detail-list div,
.mini-list div {
  padding: 0.9rem 1rem;
}

.info-grid {
  display: grid;
  gap: 0.75rem;
}

.info-card,
.boundary-card {
  padding: 1rem;
}

.chip-list {
  grid-template-columns: repeat(auto-fit, minmax(8rem, max-content));
}

.chip {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.08);
  color: #4c1d95;
  font-size: 0.8125rem;
  font-weight: 700;
}

.chip.muted {
  background: rgba(148, 163, 184, 0.12);
  color: #475569;
}

.thread-list li {
  display: grid;
  gap: 0.15rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.9);
}

.thread-list strong {
  color: #0f172a;
}

@media (min-width: 768px) {
  .drawer-card {
    padding: 1.5rem;
  }

  .info-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .controls-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
