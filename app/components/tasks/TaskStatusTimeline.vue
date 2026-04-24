<script setup lang="ts">
import type { TaskWorkflowRecord } from "../../data/task-workflow";

defineProps<{
  readonly task: TaskWorkflowRecord;
}>();
</script>

<template>
  <section class="timeline-card" aria-labelledby="task-timeline-title">
    <header class="timeline-header">
      <div class="timeline-copy">
        <p class="eyebrow">Task status timeline</p>
        <h2 id="task-timeline-title" class="timeline-title">{{ task.title }}</h2>
        <p class="timeline-text">
          The timeline shows recorded coordination changes, not runtime execution details.
        </p>
      </div>

      <div class="timeline-summary">
        <span class="summary-pill" :data-state="task.status">{{ task.status }}</span>
        <span class="summary-pill subtle" :data-state="task.approvalState.status">
          {{ task.approvalState.status }}
        </span>
      </div>
    </header>

    <ol class="timeline-list" role="list">
      <li v-for="step in task.timeline" :key="`${step.timestamp}-${step.title}`" class="timeline-step">
        <div class="timeline-marker" :data-state="step.state" aria-hidden="true"></div>
        <div class="timeline-body">
          <div class="timeline-topline">
            <div>
              <p class="timeline-time">{{ step.timestamp }}</p>
              <h3>{{ step.title }}</h3>
            </div>
            <span class="step-pill" :data-state="step.state">
              {{ step.state === "current" ? "Current" : step.state === "blocked" ? "Blocked" : "Recorded" }}
            </span>
          </div>
          <p>{{ step.detail }}</p>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.timeline-card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid rgba(51, 65, 85, 0.8);
  border-radius: 1.25rem;
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 24px 72px rgba(0, 0, 0, 0.35);
}

.timeline-header {
  display: grid;
  gap: 0.75rem;
}

.timeline-copy {
  display: grid;
  gap: 0.5rem;
}

.eyebrow,
.timeline-time {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

.timeline-title,
.timeline-body h3 {
  margin: 0;
  letter-spacing: -0.04em;
  color: #0f172a;
}

.timeline-title {
  font-size: clamp(1.4rem, 2.6vw, 2rem);
  line-height: 1.08;
}

.timeline-text,
.timeline-body p {
  margin: 0;
  color: #475569;
  line-height: 1.55;
}

.timeline-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.summary-pill,
.step-pill {
  display: inline-flex;
  align-items: center;
  min-height: 2.25rem;
  padding: 0.5rem 0.8rem;
  border: 1px solid rgba(124, 58, 237, 0.18);
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.08);
  color: #4c1d95;
  font-size: 0.8125rem;
  font-weight: 700;
  white-space: nowrap;
}

.summary-pill.subtle {
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(248, 250, 252, 0.95);
  color: #334155;
}

.summary-pill[data-state="waiting-approval"],
.summary-pill[data-state="pending"] {
  border-color: rgba(245, 158, 11, 0.2);
  background: rgba(245, 158, 11, 0.12);
  color: #92400e;
}

.summary-pill[data-state="not-needed"] {
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(248, 250, 252, 0.95);
  color: #475569;
}

.summary-pill[data-state="in-progress"],
.summary-pill[data-state="current"] {
  border-color: rgba(59, 130, 246, 0.18);
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
}

.timeline-list {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
}

.timeline-step {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.8rem;
}

.timeline-marker {
  position: relative;
  width: 1rem;
}

.timeline-marker::before {
  content: "";
  position: absolute;
  top: 0.2rem;
  left: 0.2rem;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 999px;
  background: #c4b5fd;
  box-shadow: 0 0 0 0.35rem rgba(124, 58, 237, 0.12);
}

.timeline-marker::after {
  content: "";
  position: absolute;
  left: 0.47rem;
  top: 0.9rem;
  width: 2px;
  height: calc(100% + 0.6rem);
  background: rgba(203, 213, 225, 0.9);
}

.timeline-step:last-child .timeline-marker::after {
  display: none;
}

.timeline-marker[data-state="complete"]::before {
  background: #8b5cf6;
  box-shadow: 0 0 0 0.35rem rgba(139, 92, 246, 0.14);
}

.timeline-marker[data-state="current"]::before {
  background: #2563eb;
  box-shadow: 0 0 0 0.35rem rgba(37, 99, 235, 0.16);
}

.timeline-marker[data-state="blocked"]::before {
  background: #ef4444;
  box-shadow: 0 0 0 0.35rem rgba(239, 68, 68, 0.16);
}

.timeline-body {
  display: grid;
  gap: 0.35rem;
  padding: 0.95rem 1rem;
  border: 1px solid rgba(226, 232, 240, 0.95);
  border-radius: 1rem;
  background: rgba(248, 250, 252, 0.95);
}

.timeline-topline {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  justify-content: space-between;
  gap: 0.75rem;
}

.step-pill[data-state="complete"] {
  border-color: rgba(139, 92, 246, 0.2);
  background: rgba(139, 92, 246, 0.12);
  color: #5b21b6;
}

.step-pill[data-state="current"] {
  border-color: rgba(37, 99, 235, 0.2);
  background: rgba(37, 99, 235, 0.12);
  color: #1d4ed8;
}

.step-pill[data-state="blocked"] {
  border-color: rgba(239, 68, 68, 0.2);
  background: rgba(239, 68, 68, 0.12);
  color: #991b1b;
}

@media (min-width: 768px) {
  .timeline-card {
    padding: 1.5rem;
  }
}
</style>
