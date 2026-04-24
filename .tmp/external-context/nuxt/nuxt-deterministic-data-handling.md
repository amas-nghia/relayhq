---
source: Official docs
library: Nuxt 3
package: nuxt
topic: deterministic data handling for useAsyncData useFetch and callOnce
fetched: 2026-04-14T00:00:00Z
official_docs: https://nuxt.com/docs/api/composables/use-async-data
---

## What matters for deterministic SSR

- `useAsyncData` / `useFetch` handlers should be side-effect free.
- The handler must return a truthy value; `undefined`/`null` can cause duplicate client fetches.
- Use `callOnce()` for effects that should run once during SSR/CSR, not for data fetching.

## Stable key rules

- Use stable keys for read models; the same key shares `data`, `error`, `status`, and `pending`.
- Keep these options consistent across calls with the same key: `handler`, `deep`, `transform`, `pick`, `getCachedData`, `default`.
- Options that may differ: `server`, `lazy`, `immediate`, `dedupe`, `watch`.

## Server/client fetch behavior

- `server: true` (default) fetches during SSR; `server: false` waits until hydration.
- `lazy: false` blocks navigation via Suspense; `lazy: true` is better when you can show loading UI.
- `dedupe: 'cancel'` is the default and cancels in-flight requests when a new one starts.

## Caching note

- Default cache data comes from the Nuxt payload/static payload only when payload extraction is enabled.
- If cached data is missing, Nuxt fetches again.

## Practical guidance for deterministic read models

```ts
const { data } = await useAsyncData('vault-read-model:user-123', async (_nuxtApp, { signal }) => {
  return $fetch('/api/read-model/user-123', { signal })
})
```

- Keep the key derived from stable identifiers only.
- Avoid `Date.now()`, random keys, or request-local side effects in the handler.
- Use `callOnce()` for one-time setup/logging, not inside query handlers.
