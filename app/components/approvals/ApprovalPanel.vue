<script setup lang="ts">
import { computed, ref } from "vue";

import { buildRequestChangesPatch } from "../../data/task-actions";
import { relayhqReadModelKey } from "../../data/relayhq-overview";
import type { TaskWorkflowApprovalRecord, TaskWorkflowRecord } from "../../data/task-workflow";

type PendingApprovalAction = "approve" | "reject" | "request-changes";

interface PendingApprovalActionCard {
  readonly id: PendingApprovalAction;
  readonly title: string;
  readonly note: string;
  readonly tone: "neutral" | "positive" | "danger";
  readonly requiresReason: boolean;
}

interface InformationalActionCard {
  readonly title: string;
  readonly note: string;
}

const props = defineProps<{
  readonly task: TaskWorkflowRecord;
}>();

const latestApproval = computed<TaskWorkflowApprovalRecord | null>(() => props.task.approvals[0] ?? null);
const reviewerId = ref(props.task.createdBy);
const activeAction = ref<PendingApprovalAction | null>(null);
const actionReason = ref("");
const isSubmitting = ref(false);
const actionError = ref<string | null>(null);
const actionSuccess = ref<string | null>(null);
const isPendingApproval = computed(() => props.task.approvalState.status === "pending");

const pendingActionItems = computed<ReadonlyArray<PendingApprovalActionCard>>(() => {
  if (!isPendingApproval.value) {
    return [];
  }

  return [
    {
      id: "approve",
      title: "Approve",
      note: "Records a positive decision and releases the gate.",
      tone: "positive",
      requiresReason: false,
    },
    {
      id: "reject",
      title: "Reject",
      note: "Keeps the gate closed and captures the decision trail.",
      tone: "danger",
      requiresReason: true,
    },
    {
      id: "request-changes",
      title: "Request Changes",
      note: "Returns the task to coordination without exposing runtime details.",
      tone: "neutral",
      requiresReason: true,
    },
  ];
});

const informationalActionItems = computed<ReadonlyArray<InformationalActionCard>>(() => {
  const state = props.task.approvalState.status;

  if (state === "approved") {
    return [
      { title: "Approval complete", note: "The decision is already recorded in the vault." },
      { title: "Continue coordination", note: "The task can move forward once the next step is ready." },
    ];
  }

  if (state === "rejected") {
    return [
      { title: "Decision recorded", note: "The gate is closed until the task is updated." },
      { title: "Revise and resubmit", note: "Adjust the task record before asking again." },
    ];
  }

  return [{ title: "No approval required", note: "This task does not need a gate before work continues." }];
});

const activeActionCard = computed<PendingApprovalActionCard | null>(
  () => pendingActionItems.value.find((item) => item.id === activeAction.value) ?? null,
);

const canSubmitActiveAction = computed(() => {
  if (activeActionCard.value === null) {
    return false;
  }

  if (reviewerId.value.trim().length === 0) {
    return false;
  }

  if (activeActionCard.value.requiresReason) {
    return actionReason.value.trim().length > 0;
  }

  return true;
});

function resetActionFeedback(): void {
  actionError.value = null;
  actionSuccess.value = null;
}

function selectAction(action: PendingApprovalAction): void {
  resetActionFeedback();
  activeAction.value = action;

  if (action !== "approve") {
    return;
  }

  void submitApprovalAction("approve");
}

function clearActiveAction(): void {
  activeAction.value = null;
  actionReason.value = "";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "RelayHQ could not update the task approval state.";
}

async function submitApprovalAction(action: PendingApprovalAction): Promise<void> {
  const actorId = reviewerId.value.trim();
  const reason = actionReason.value.trim();

  if (actorId.length === 0) {
    actionError.value = "Reviewer identity is required before updating approval state.";
    return;
  }

  if ((action === "reject" || action === "request-changes") && reason.length === 0) {
    actionError.value = "Add a coordination reason before submitting this decision.";
    return;
  }

  isSubmitting.value = true;
  resetActionFeedback();

  try {
    if (action === "approve") {
      await $fetch(`/api/vault/tasks/${props.task.id}/approve`, {
        method: "POST",
        body: { actorId },
      });
      actionSuccess.value = "Approval recorded in the vault.";
    } else if (action === "reject") {
      await $fetch(`/api/vault/tasks/${props.task.id}/reject`, {
        method: "POST",
        body: { actorId, reason },
      });
      actionSuccess.value = "Rejection recorded and the task remains gated.";
    } else {
      await $fetch(`/api/vault/tasks/${props.task.id}`, {
        method: "PATCH",
        body: {
          actorId,
          patch: buildRequestChangesPatch(reason),
        },
      });
      actionSuccess.value = "Request changes recorded and the task returned to todo.";
    }

    clearActiveAction();
    await refreshNuxtData(relayhqReadModelKey);
  } catch (error: unknown) {
    actionError.value = toErrorMessage(error);
  } finally {
    isSubmitting.value = false;
  }
}

async function submitActiveAction(): Promise<void> {
  if (activeAction.value === null || activeAction.value === "approve") {
    return;
  }

  await submitApprovalAction(activeAction.value);
}
</script>

<template>
  <article class="approval-card" aria-labelledby="approval-panel-title">
    <header class="approval-header">
      <div class="approval-copy">
        <p class="eyebrow">Approval panel</p>
        <h2 id="approval-panel-title" class="approval-title">{{ task.title }}</h2>
        <p class="approval-text">
          The approval surface reflects vault state and keeps runtime execution details out of view.
        </p>
      </div>

      <div class="approval-state" aria-label="Approval state">
        <span class="approval-pill" :data-state="task.approvalState.status">
          {{ task.approvalState.status }}
        </span>
        <span class="approval-pill subtle" :data-state="task.status">{{ task.status }}</span>
      </div>
    </header>

    <section class="panel-section" aria-labelledby="approval-trail-heading">
      <div class="section-header">
        <p class="section-kicker">Decision trail</p>
        <h3 id="approval-trail-heading">Current gate state</h3>
      </div>

      <dl class="trail-list">
        <div>
          <dt>Approval needed</dt>
          <dd>{{ task.approvalNeeded ? "Yes" : "No" }}</dd>
        </div>
        <div>
          <dt>Requested by</dt>
          <dd>{{ task.approvalState.requestedBy ?? "—" }}</dd>
        </div>
        <div>
          <dt>Requested at</dt>
          <dd>{{ task.approvalState.requestedAt ?? "—" }}</dd>
        </div>
        <div>
          <dt>Decided by</dt>
          <dd>{{ task.approvalState.decidedBy ?? "—" }}</dd>
        </div>
        <div>
          <dt>Decision time</dt>
          <dd>{{ task.approvalState.decidedAt ?? "—" }}</dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{{ task.approvalState.reason ?? "No reason recorded" }}</dd>
        </div>
      </dl>
    </section>

    <section class="panel-section" aria-labelledby="actions-heading">
      <div class="section-header">
        <p class="section-kicker">Visible actions</p>
        <h3 id="actions-heading">Approval controls</h3>
      </div>

      <template v-if="isPendingApproval">
        <div class="action-form">
          <label class="field-stack" for="approval-reviewer-id">
            <span>Reviewer identity</span>
            <input
              id="approval-reviewer-id"
              v-model="reviewerId"
              class="field-input"
              name="reviewerId"
              autocomplete="off"
              spellcheck="false"
              placeholder="@reviewer"
            />
          </label>

          <ul class="action-list" role="list">
            <li v-for="action in pendingActionItems" :key="action.id" class="action-card">
              <strong>{{ action.title }}</strong>
              <p>{{ action.note }}</p>
              <button
                class="action-button"
                :class="[`tone-${action.tone}`]"
                type="button"
                :disabled="isSubmitting"
                @click="selectAction(action.id)"
              >
                {{ isSubmitting && activeAction === action.id ? "Saving…" : action.title }}
              </button>
            </li>
          </ul>

          <form
            v-if="activeActionCard !== null && activeActionCard.requiresReason"
            class="reason-form"
            @submit.prevent="submitActiveAction"
          >
            <label class="field-stack" for="approval-action-reason">
              <span>{{ activeActionCard.title }} reason</span>
              <textarea
                id="approval-action-reason"
                v-model="actionReason"
                class="field-textarea"
                name="reason"
                rows="4"
                :placeholder="activeAction === 'reject' ? 'Explain why the gate stays closed.' : 'Describe the revision needed before this returns for review.'"
              />
            </label>

            <p class="field-note">
              RelayHQ records this as coordination state in the task document without exposing runtime execution detail.
            </p>

            <div class="reason-actions">
              <button class="action-button" :class="[`tone-${activeActionCard.tone}`]" type="submit" :disabled="isSubmitting || !canSubmitActiveAction">
                {{ isSubmitting ? "Saving…" : activeActionCard.title }}
              </button>
              <button class="action-button tone-subtle" type="button" :disabled="isSubmitting" @click="clearActiveAction">
                Cancel
              </button>
            </div>
          </form>

          <p v-if="actionError" class="feedback-text error" role="alert">{{ actionError }}</p>
          <p v-else-if="actionSuccess" class="feedback-text success" aria-live="polite">{{ actionSuccess }}</p>
        </div>
      </template>

      <ul v-else class="action-list" role="list">
        <li v-for="action in informationalActionItems" :key="action.title" class="action-card">
          <strong>{{ action.title }}</strong>
          <p>{{ action.note }}</p>
        </li>
      </ul>
    </section>

    <article v-if="latestApproval" class="latest-card">
      <div class="section-header">
        <p class="section-kicker">Latest approval file</p>
        <h3>Linked record {{ latestApproval.id }}</h3>
      </div>

      <dl class="latest-meta">
        <div>
          <dt>Status</dt>
          <dd>{{ latestApproval.status }}</dd>
        </div>
        <div>
          <dt>Outcome</dt>
          <dd>{{ latestApproval.outcome }}</dd>
        </div>
      </dl>
    </article>

    <section class="panel-section" aria-labelledby="approval-history-heading">
      <div class="section-header">
        <p class="section-kicker">Approval records</p>
        <h3 id="approval-history-heading">Linked vault entries</h3>
      </div>

      <ul class="history-list" role="list">
        <li v-if="task.approvals.length === 0" class="history-card muted">
          <strong>No approval document linked</strong>
          <p>The task does not have a separate approval record in the vault yet.</p>
        </li>
        <li v-for="approval in task.approvals" :key="approval.id" class="history-card">
          <div class="history-topline">
            <strong>{{ approval.id }}</strong>
            <span class="history-pill" :data-state="approval.outcome">{{ approval.status }}</span>
          </div>

          <dl class="history-meta">
            <div>
              <dt>Requested</dt>
              <dd>{{ approval.requestedAt ?? "—" }}</dd>
            </div>
            <div>
              <dt>Decision</dt>
              <dd>{{ approval.decidedAt ?? "Pending" }}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{{ approval.reason ?? "No reason recorded" }}</dd>
            </div>
          </dl>
        </li>
      </ul>
    </section>

    <article class="boundary-card">
      <h3>Boundary reminder</h3>
      <p>
        RelayHQ only exposes the coordination record here. Execution logs, heartbeat values, and
        runtime tool output remain outside this surface.
      </p>
    </article>
  </article>
</template>

<style scoped>
.approval-card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.approval-header,
.panel-section,
.section-header,
.boundary-card {
  display: grid;
  gap: 0.75rem;
}

.approval-copy {
  display: grid;
  gap: 0.5rem;
}

.eyebrow,
.section-kicker,
.trail-list dt,
.history-meta dt {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

.approval-title,
.section-header h3,
.action-card strong,
.history-card strong,
.boundary-card h3 {
  margin: 0;
  letter-spacing: -0.04em;
  color: #0f172a;
}

.approval-title {
  font-size: clamp(1.4rem, 2.5vw, 2rem);
  line-height: 1.08;
}

.approval-text,
.action-card p,
.history-card p,
.history-meta dd,
.boundary-card p,
.trail-list dd {
  margin: 0;
  color: #475569;
  line-height: 1.55;
}

.approval-state {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.approval-pill,
.history-pill {
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

.approval-pill.subtle {
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(248, 250, 252, 0.95);
  color: #334155;
}

.approval-pill[data-state="pending"],
.history-pill[data-state="pending"] {
  border-color: rgba(245, 158, 11, 0.2);
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
}

.approval-pill[data-state="not-needed"],
.history-pill[data-state="not-needed"] {
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(248, 250, 252, 0.95);
  color: #475569;
}

.approval-pill[data-state="approved"],
.history-pill[data-state="approved"] {
  border-color: rgba(16, 185, 129, 0.2);
  background: rgba(16, 185, 129, 0.12);
  color: #065f46;
}

.approval-pill[data-state="rejected"],
.history-pill[data-state="rejected"] {
  border-color: rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.12);
  color: #991b1b;
}

.trail-list,
.action-list,
.history-list,
.latest-meta {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
}

.trail-list div,
.action-card,
.history-card,
.boundary-card,
.latest-card,
.latest-meta div {
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.95);
}

.trail-list div {
  padding: 0.9rem 1rem;
}

.action-card,
.history-card,
.boundary-card,
.latest-card {
  padding: 1rem;
}

.action-card {
  display: grid;
  gap: 0.25rem;
}

.action-form,
.reason-form,
.field-stack {
  display: grid;
  gap: 0.75rem;
}

.field-stack span,
.field-note,
.feedback-text {
  margin: 0;
  color: #475569;
  line-height: 1.55;
}

.field-stack span {
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
}

.field-input,
.field-textarea,
.action-button {
  font: inherit;
}

.field-input,
.field-textarea {
  width: 100%;
  padding: 0.8rem 0.95rem;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 0.9rem;
  background: rgba(255, 255, 255, 0.96);
  color: #0f172a;
}

.field-input:focus-visible,
.field-textarea:focus-visible,
.action-button:focus-visible {
  outline: 2px solid rgba(124, 58, 237, 0.35);
  outline-offset: 2px;
}

.field-textarea {
  resize: vertical;
}

.reason-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid transparent;
  border-radius: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.action-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.action-button:disabled {
  cursor: wait;
  opacity: 0.7;
}

.tone-positive {
  background: rgba(16, 185, 129, 0.12);
  border-color: rgba(16, 185, 129, 0.24);
  color: #065f46;
}

.tone-danger {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.24);
  color: #991b1b;
}

.tone-neutral,
.tone-subtle {
  background: rgba(248, 250, 252, 0.95);
  border-color: rgba(148, 163, 184, 0.3);
  color: #334155;
}

.feedback-text.error {
  color: #b91c1c;
}

.feedback-text.success {
  color: #166534;
}

.history-topline {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  justify-content: space-between;
  gap: 0.75rem;
}

.history-meta {
  display: grid;
  gap: 0.75rem;
  margin: 0.75rem 0 0;
}

.history-meta div {
  padding: 0.85rem 0.95rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 0.9rem;
  background: rgba(255, 255, 255, 0.88);
}

.history-card.muted {
  opacity: 0.9;
}

.latest-card {
  display: grid;
  gap: 0.75rem;
}

.latest-meta div {
  padding: 0.85rem 0.95rem;
}

@media (min-width: 768px) {
  .approval-card {
    padding: 1.5rem;
  }

  .trail-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
