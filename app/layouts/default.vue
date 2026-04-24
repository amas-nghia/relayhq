<template>
  <div class="dark min-h-screen bg-transparent text-slate-100">
    <a class="skip-link" href="#main-content">Skip to main content</a>

    <div class="mx-auto flex min-h-screen max-w-[1800px] overflow-hidden px-4 py-4 lg:gap-4">
      <aside class="hidden w-72 shrink-0 overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/80 shadow-2xl shadow-black/40 backdrop-blur lg:flex lg:flex-col">
        <div class="border-b border-slate-800 px-5 py-5">
          <p class="theme-kicker text-[10px] font-bold uppercase">RelayHQ</p>
          <h1 class="mt-2 text-lg font-semibold tracking-tight text-slate-50">Vault-first control plane</h1>
          <p class="mt-2 text-sm text-slate-400">Human and agent coordination with the vault as the canonical state layer.</p>
        </div>

        <div class="flex-1 overflow-y-auto px-3 py-4 kanban-scroll">
          <WorkspaceNav />
        </div>

        <div class="border-t border-slate-800 px-5 py-4 text-xs text-slate-500">
          Running in dark theme shell from `relay-hq-dark-main`, adapted to Nuxt routes and live vault data.
        </div>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/70 shadow-2xl shadow-black/40 backdrop-blur">
        <header class="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 px-5 lg:px-6">
          <div>
            <p class="theme-kicker text-[10px] font-bold uppercase">Workspace</p>
            <p class="mt-1 text-sm text-slate-300">Integrated dark surface using live RelayHQ data</p>
          </div>

          <div class="hidden items-center gap-2 md:flex">
            <span class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-300">Vault source of truth</span>
            <span class="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-300">Control plane only</span>
          </div>
        </header>

        <main id="main-content" class="min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-6 lg:py-6 kanban-scroll">
          <slot />
        </main>
      </div>
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
}

* {
  box-sizing: border-box;
}

a {
  color: inherit;
  text-decoration: none;
}

a:focus-visible,
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid rgba(52, 211, 153, 0.6);
  outline-offset: 2px;
}

.skip-link {
  position: absolute;
  left: 1rem;
  top: 1rem;
  transform: translateY(-180%);
  padding: 0.75rem 1rem;
  border-radius: 999px;
  background: #020617;
  color: #f8fafc;
  z-index: 30;
}

.skip-link:focus {
  transform: translateY(0);
}
</style>
