<script setup lang="ts">
import type { BoardColumnRecord } from "../../data/relayhq-overview";

type BoardTaskRecord = BoardColumnRecord["tasks"][number];

function taskCardClass(task: BoardTaskRecord): Record<string, boolean> {
  return {
    "is-stale": task.isStale,
    "is-approval-pending": task.approval === "pending" && !task.isStale,
    "is-priority-critical": task.priority === "critical" && !task.isStale,
    "is-priority-high": task.priority === "high" && !task.isStale && task.approval !== "pending",
    "is-priority-low": task.priority === "low",
  };
}

defineProps<{
  readonly boardName: string;
  readonly boardId: string;
  readonly summary: string;
  readonly metrics: ReadonlyArray<{ readonly label: string; readonly value: string; readonly note: string }>;
  readonly columns: ReadonlyArray<BoardColumnRecord>;
}>();
</script>

<template>
  <section class="board-columns" aria-labelledby="board-columns-title">
    <header class="board-header">
      <div class="board-copy">
        <p class="eyebrow">Board columns</p>
        <h2 id="board-columns-title" class="board-title">{{ boardName }}</h2>
        <p class="board-text">{{ summary }}</p>
      </div>

      <dl class="board-metrics" aria-label="Board metrics">
        <div v-for="metric in metrics" :key="metric.label" class="metric-chip">
          <dt>{{ metric.label }}</dt>
          <dd>
            <strong>{{ metric.value }}</strong>
            <span>{{ metric.note }}</span>
          </dd>
        </div>
      </dl>
    </header>

    <div class="column-grid" role="list" :aria-label="`${boardName} columns`">
      <article v-for="column in columns" :key="column.id" class="column-card" role="listitem">
        <header class="column-header">
          <div>
            <p class="column-index">{{ String(column.position).padStart(2, "0") }}</p>
            <h3>{{ column.title }}</h3>
          </div>
          <span class="column-count">{{ column.taskCount }} task<span v-if="column.taskCount !== 1">s</span></span>
        </header>

        <p class="column-summary">{{ column.summary }}</p>

        <ul class="task-list" role="list">
          <li v-for="task in column.tasks" :key="task.id" class="task-card" :class="taskCardClass(task)">
            <NuxtLink class="task-link" :to="`/tasks/${task.id}`">
              <div class="task-topline">
                <strong>{{ task.title }}</strong>
                <div class="task-badges">
                  <span v-if="task.isStale" class="task-status stale">Stale</span>
                  <span v-if="task.approval === 'pending'" class="task-status approval-pending">Approval pending</span>
                  <span class="task-status">{{ task.status }}</span>
                </div>
              </div>

              <p class="task-note">{{ task.note }}</p>

              <dl class="task-meta">
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
                <div>
                  <dt>Approval</dt>
                  <dd>{{ task.approval }}</dd>
                </div>
              </dl>
            </NuxtLink>
          </li>
        </ul>
      </article>
    </div>
  </section>
</template>

<style scoped>
.board-columns {
  display: grid;
  gap: 1rem;
}

.board-header {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid rgba(51, 65, 85, 0.8);
  border-radius: 1.25rem;
  background: rgba(15, 23, 42, 0.9);
  box-shadow: 0 24px 72px rgba(0, 0, 0, 0.35);
}

.board-copy {
  display: grid;
  gap: 0.5rem;
}

.eyebrow,
.column-index,
.metric-chip dt,
.task-meta dt {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #34d399;
}

.board-title,
.column-header h3 {
  margin: 0;
  letter-spacing: -0.04em;
  color: #f8fafc;
}

.board-title {
  font-size: clamp(1.5rem, 2.8vw, 2.2rem);
  line-height: 1.08;
}

.board-text,
.column-summary,
.task-note,
.metric-chip dd,
.task-meta dd {
  margin: 0;
  color: #94a3b8;
  line-height: 1.55;
}

.board-metrics {
  display: grid;
  gap: 0.75rem;
  margin: 0;
}

.metric-chip {
  display: grid;
  gap: 0.15rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(51, 65, 85, 0.9);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.76);
}

.metric-chip dd strong {
  display: block;
  color: #f8fafc;
  font-size: 1.25rem;
}

.column-grid {
  display: grid;
  gap: 0.75rem;
}

.column-card,
.task-card {
  border: 1px solid rgba(51, 65, 85, 0.9);
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.84);
}

.column-card {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
}

.column-header,
.task-topline {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 0.75rem;
}

.task-badges {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: 0.4rem;
}

.column-count,
.task-status {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.12);
  color: #6ee7b7;
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
}

.task-status.stale {
  border: 1px solid rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.12);
  color: #fca5a5;
}

.task-list {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
}

.task-card {
  display: grid;
  border-color: rgba(226, 232, 240, 0.95);
  border-left-width: 3px;
}

.task-card.is-priority-critical {
  border-left-color: #dc2626;
}

.task-card.is-priority-high {
  border-left-color: #d97706;
}

.task-card.is-priority-low {
  opacity: 0.8;
}

.task-card.is-stale {
  border-color: rgba(239, 68, 68, 0.35);
  border-left-color: #dc2626;
}

.task-card.is-approval-pending {
  border-left-color: #d97706;
}

.task-link {
  display: grid;
  gap: 0.65rem;
  padding: 0.9rem;
  border-radius: inherit;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.task-link:hover,
.task-link:focus-visible {
  transform: translateY(-1px);
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.task-status.approval-pending {
  border: 1px solid rgba(217, 119, 6, 0.24);
  background: rgba(245, 158, 11, 0.14);
  color: #92400e;
}

.task-card strong {
  color: #0f172a;
}

.task-meta {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (min-width: 768px) {
  .board-header {
    grid-template-columns: minmax(0, 1.2fr) minmax(20rem, 0.8fr);
    align-items: start;
    padding: 1.5rem;
  }

  .board-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .column-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1200px) {
  .column-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
