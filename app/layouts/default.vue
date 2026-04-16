<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">Skip to main content</a>

    <header class="app-header" aria-label="RelayHQ workspace header">
      <div class="brand-block">
        <p class="eyebrow">RelayHQ</p>
        <h1 class="brand-title">Control plane for agent-assisted work</h1>
        <p class="brand-copy">
          Vault-first coordination for workspaces, projects, boards, tasks, approvals,
          and audit history.
        </p>
      </div>

      <div class="status-block" aria-label="Platform status">
        <span class="status-pill">Control plane only</span>
        <span class="status-pill">Vault source of truth</span>
      </div>
    </header>

    <div class="app-grid">
      <aside class="sidebar" aria-label="Workspace navigation panel">
        <WorkspaceNav />
      </aside>

      <main id="main-content" class="app-main">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import WorkspaceNav from "../components/navigation/WorkspaceNav.vue";
</script>

<style>
html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(102, 126, 234, 0.12), transparent 34%),
    linear-gradient(180deg, #f7f8fc 0%, #eef1f8 100%);
  color: #111827;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

a {
  color: inherit;
  text-decoration: none;
}

a:focus-visible,
button:focus-visible {
  outline: 3px solid #7c3aed;
  outline-offset: 3px;
}

.app-shell {
  min-height: 100vh;
  padding: 1rem;
}

.skip-link {
  position: absolute;
  left: 1rem;
  top: 1rem;
  transform: translateY(-180%);
  padding: 0.75rem 1rem;
  border-radius: 999px;
  background: #111827;
  color: #ffffff;
  z-index: 20;
}

.skip-link:focus {
  transform: translateY(0);
}

.app-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin: 0 auto 1rem;
  max-width: 96rem;
  padding: 1.25rem 1.25rem 1rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 1.25rem;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18px);
  box-shadow: 0 24px 64px rgba(15, 23, 42, 0.08);
}

.brand-block {
  display: grid;
  gap: 0.5rem;
  max-width: 42rem;
}

.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #6d28d9;
}

.brand-title {
  margin: 0;
  font-size: clamp(1.5rem, 3vw, 2.5rem);
  line-height: 1.05;
  letter-spacing: -0.04em;
}

.brand-copy {
  margin: 0;
  max-width: 38rem;
  color: #475569;
  line-height: 1.6;
}

.status-block {
  display: flex;
  flex-wrap: wrap;
  gap: 0.625rem;
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
  font-weight: 600;
}

.app-grid {
  display: grid;
  gap: 1rem;
  margin: 0 auto;
  max-width: 96rem;
}

.sidebar,
.app-main {
  min-width: 0;
}

.sidebar {
  border-radius: 1.25rem;
}

.app-main {
  border-radius: 1.25rem;
}

@media (min-width: 1024px) {
  .app-shell {
    padding: 1.5rem;
  }

  .app-grid {
    grid-template-columns: minmax(18rem, 22rem) minmax(0, 1fr);
    align-items: start;
    gap: 1.25rem;
  }

  .sidebar {
    position: sticky;
    top: 1.5rem;
  }
}
</style>
