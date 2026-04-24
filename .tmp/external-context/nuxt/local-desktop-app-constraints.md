---
source: Context7 API
library: Nuxt
package: nuxt
topic: local-desktop-app-constraints
fetched: 2026-04-13T00:00:00Z
official_docs: https://nuxt.com/docs/3.x
---

## Constraints for local desktop-like Nuxt apps

- `ssr: false` turns Nuxt into a client-side SPA; generated output has no server-rendered HTML.
- Use `<ClientOnly>` or `.client.vue` for browser-only APIs and DOM-dependent widgets.
- Any `server/api` or `routes/` code still implies a server runtime (Nitro), so desktop packaging may need a local Node process.
- Sensitive values should stay in private `runtimeConfig`; anything in `public` is client-visible.

## Relevant excerpts

```ts
export default defineNuxtConfig({ ssr: false })
```

```vue
<ClientOnly fallback-tag="span" fallback="Loading...">
  <BrowserOnlyWidget />
</ClientOnly>
```

## Notes for analysis

- Nuxt works well for desktop-like shells when treated as an SPA + client-only UI.
- Avoid assuming server routes, filesystem access, or secrets are available in the browser bundle.
