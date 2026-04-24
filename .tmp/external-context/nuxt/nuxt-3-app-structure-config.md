---
source: Context7 API
library: Nuxt
package: nuxt
topic: nuxt-3-app-structure-config
fetched: 2026-04-13T00:00:00Z
official_docs: https://nuxt.com/docs/3.x
---

## Nuxt 3 structure/config notes

- `app.vue` is the app root; typically wraps `<NuxtPage />` in `<NuxtLayout>`.
- `components/` is auto-imported; `.client.vue` and `.server.vue` split client/server rendering.
- `composables/` is auto-scanned at the top level by default.
- `server/` contains `api/`, `routes/`, and `middleware/` for Nitro server code.
- `runtimeConfig` lives in `nuxt.config.ts`; private keys stay server-only, `public` keys are exposed to the client.
- `useRuntimeConfig(event)` is recommended in server routes so env overrides are applied correctly.
- `imports.presets` enables third-party auto-imports.

## Relevant excerpts

```vue
<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
```

```ts
export default defineNuxtConfig({
  runtimeConfig: {
    githubToken: '',
    public: { apiBase: '/api' },
  },
})
```

## Notes for analysis

- Nuxt is convention-driven; app structure matters more than manual wiring.
- Server features are built into the framework, so config/runtime boundaries are important.
