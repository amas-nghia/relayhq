---
source: Context7 API
library: Nuxt
package: nuxt
topic: server/shared module conventions
fetched: 2026-04-14T00:00:00Z
official_docs: https://nuxt.com/docs/guide/directory-structure/server / https://nuxt.com/docs/guide/directory-structure/shared / https://nuxt.com/docs/guide/directory-structure/app/components
---

## Server directory

Nuxt's `server/` directory is for Nitro-side files such as:

```bash
server/
  api/
  routes/
  middleware/
```

`server/api/*` maps to API endpoints, `server/routes/*` to custom routes, and `server/middleware/*` to request middleware.

## Shared directory

`shared/` is available in Nuxt v3.14+ and is usable from both the Vue app and Nitro server.

- Shared code must not import Vue or Nitro code.
- Use `#shared/...` for manual imports outside auto-imported paths.

Examples:

```ts
import capitalize from '#shared/capitalize'
import lower from '#shared/formatters/lower'
```

## Module/runtime conventions

For Nuxt modules, server-only runtime code belongs under `runtime/server/`.

- `addServerScanDir(resolve('./runtime/server'))` registers a server runtime directory for Nitro scanning.
- `addServerImportsDir(resolve('./runtime/server/composables'))` auto-imports server-side utilities.
- `addServerTemplate()` creates server-only virtual files that can be imported from server code.

## Import boundaries

- `@nuxt/kit` utilities are for module/runtime authoring, not app runtime files like components, composables, pages, plugins, or server routes.
- `.server` / `.client` suffixes are used to split environment-specific files.
- Paired `.server.vue` and `.client.vue` components are supported for environment-specific rendering.

## Practical takeaway for pure server-side bridge modules

Keep pure server bridge code in `server/` or module `runtime/server/`, and keep shared logic in `shared/` only if it is framework-agnostic.
