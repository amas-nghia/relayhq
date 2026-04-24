---
source: Official docs
library: Nuxt 3
package: nuxt
topic: server implementation patterns for utilities and API services
fetched: 2026-04-14T00:00:00Z
official_docs: https://nuxt.com/docs/guide/directory-structure/server
---

## Implementation-useful patterns

- Put server-only helpers, adapters, and handler wrappers in `server/utils/`.
- Keep HTTP handlers thin in `server/api/*`; use `export default defineEventHandler(...)`.
- Use `#server/...` imports for server-local modules instead of deep relative paths.
- Keep framework-agnostic contracts in `shared/` / `shared/types/` when they must be reused outside Nitro.

## Validation and runtime config

- Validate input at the edge with `getValidatedRouterParams`, `getValidatedQuery`, and `readValidatedBody`.
- Use `useRuntimeConfig(event)` in server routes so runtime env overrides are applied.
- Return typed DTOs from handlers; avoid `res.end()` when you want Nitro to infer typings.

## Server-to-server calls and background work

- Use `event.$fetch` to forward request headers/context inside server routes.
- Use `event.waitUntil()` for background logging/cache work that should not block the response.

## Practical shape for read-model queries

```ts
// server/utils/read-model.ts
export const createReadModelQuery = (deps: { /* vault/db clients */ }) => {
  return async (input: { id: string }) => {
    // validate -> query -> map to DTO
  }
}

// server/api/read-model/[id].get.ts
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, schema)
  return createReadModelQuery(/* deps */)({ id })
})
```

## Pitfalls

- Don’t put stateful app logic in middleware; middleware should only inspect/extend context.
- Don’t rely on long relative imports in server code; use `#server`.
- Keep query handlers pure and idempotent so repeated SSR/client hydration does not change results.
