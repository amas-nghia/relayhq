---
source: Official docs
library: Nuxt 3
package: nuxt
topic: shared server-side contracts and module/file conventions
fetched: 2026-04-14T00:00:00Z
official_docs: https://nuxt.com/docs/guide/directory-structure
---

## Relevant Nuxt 3 conventions

- Root config lives in `nuxt.config.ts`.
- `server/` holds server code; Nuxt auto-scans it for API routes, routes, middleware, plugins, and `server/utils/`.
- `shared/` is for code shared between the Vue app and Nitro server.
- `modules/` is for local Nuxt modules; auto-registered patterns are `modules/*/index.ts` and `modules/*.ts`.
- `layers/` is for reusable shared app code/config across layers.

## File and import patterns

- Use `server/api/*.ts` for `/api/*` routes.
- Use `server/routes/*.ts` for routes without the `/api` prefix.
- Use `server/utils/*` for server-only helpers; Nuxt auto-imports exports from there.
- Use `#server/...` to import from anywhere under `server/`.
- Use `#shared/...` for files in `shared/` that are not auto-imported.

## Shared code rules

- `shared/` is available in Nuxt v3.14+.
- Code in `shared/` cannot import Vue or Nitro code.
- Only `shared/utils/` and `shared/types/` are auto-imported.
- Nested folders under `shared/utils/` or `shared/types/` are not auto-imported unless added to `imports.dirs` and `nitro.imports.dirs`.

## TypeScript guidance for server contracts

- Nuxt generates `.nuxt/tsconfig.*.json` project references, including `.nuxt/tsconfig.server.json` and `.nuxt/tsconfig.shared.json`.
- Put server-only type augmentation in `server/` and shared augmentation in `shared/`.
- Do not hand-edit the generated `tsconfig.json`; extend via `nuxt.config.ts`.
- Generated types include path aliases like `#imports`, `~/file`, `#build/file`, and API route types.

## Typed server APIs and runtime validation

- Nitro generates typings for API routes and middleware when handlers return values instead of using `res.end()`.
- For runtime + type safety, use validated helpers like `getValidatedRouterParams`, `readValidatedBody`, and `getValidatedQuery` with a schema validator such as Zod.
- Prefer `useRuntimeConfig(event)` in server routes when reading runtime config.

## Useful patterns for persistence contracts

- Keep shared persistence contracts in `shared/types/`.
- Keep server-only persistence adapters or DB helpers in `server/utils/`.
- Keep route handlers thin; validate input at the edge and return typed DTOs.
- Use `event.$fetch` if a server route needs to forward request context/headers.
