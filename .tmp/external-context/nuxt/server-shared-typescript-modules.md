---
source: Context7 API
library: Nuxt
package: nuxt
topic: server-shared TypeScript modules
fetched: 2026-04-14T00:00:00Z
official_docs: https://nuxt.com/docs/3.x/directory-structure/shared
---

## Shared logic placement

- Use `shared/` for code that must run in both the Vue app and Nitro server.
- `shared/` is available in Nuxt v3.14+.
- Code in `shared/` must not import Vue- or Nitro-specific APIs.

## Server-only logic placement

- Use `server/` for API routes, server routes, middleware, and plugins.
- Nuxt scans `server/` automatically and supports HMR.
- Put reusable server helpers in `server/utils/`; exported functions and variables there are auto-imported in server code.

## Export conventions for Nuxt server code

- Prefer `export default defineEventHandler(...)` for server endpoints and middleware.
- For reusable helpers, export a function from `server/utils/` or `shared/utils/`.
- In `shared/utils/`, both named exports and default exports are supported and auto-importable.

## Practical convention

- Shared protocol/domain helpers: `shared/`
- Server-only wrappers/adapters: `server/utils/`
- HTTP handlers: `server/api/*` with default-exported `defineEventHandler`
