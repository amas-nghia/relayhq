<script setup lang="ts">
const props = defineProps<{
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
}>();
</script>

<template>
  <section class="empty-card" aria-live="polite">
    <div class="empty-illustration" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <div class="empty-copy">
      <p class="empty-kicker">Empty state</p>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </div>
    <NuxtLink v-if="props.actionLabel && props.actionHref" class="empty-action" :to="props.actionHref">
      {{ props.actionLabel }}
    </NuxtLink>
  </section>
</template>

<style scoped>
.empty-card {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
  border: 1px solid rgba(51, 65, 85, 0.8);
  border-radius: 1.25rem;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(15, 23, 42, 0.82));
  box-shadow: 0 24px 72px rgba(0, 0, 0, 0.45);
}

.empty-illustration {
  display: flex;
  align-items: end;
  gap: 0.5rem;
  min-height: 4rem;
}

.empty-illustration span {
  flex: 1;
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.14);
}

.empty-illustration span:nth-child(1) {
  height: 1.8rem;
}

.empty-illustration span:nth-child(2) {
  height: 3rem;
}

.empty-illustration span:nth-child(3) {
  height: 2.2rem;
}

.empty-copy {
  display: grid;
  gap: 0.45rem;
}

.empty-kicker {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
  color: #34d399;
}

h2,
p {
  margin: 0;
}

h2 {
  letter-spacing: -0.04em;
  color: #f8fafc;
}

p {
  color: #94a3b8;
  line-height: 1.6;
}

.empty-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-height: 2.5rem;
  padding: 0.625rem 0.9rem;
  border: 1px solid rgba(52, 211, 153, 0.26);
  border-radius: 999px;
  background: rgba(52, 211, 153, 0.12);
  color: #6ee7b7;
  font-weight: 700;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    background-color 160ms ease;
}

.empty-action:hover,
.empty-action:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(52, 211, 153, 0.34);
  background: rgba(15, 23, 42, 0.98);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35);
}

@media (min-width: 768px) {
  .empty-card {
    padding: 1.5rem;
  }
}
</style>
