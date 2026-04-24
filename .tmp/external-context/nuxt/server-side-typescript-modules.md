---
source: Context7 API
library: Nuxt
package: nuxt
topic: server-side TypeScript modules
fetched: 2026-04-14T00:00:00Z
official_docs: https://nuxt.com/docs/3.x/directory-structure/server
---

## Server-side module layout

- `server/` holds API routes, server routes, middleware, plugins, and utilities.
- `server/utils/` is for reusable server helpers and handler wrappers.
- Import server-local modules with the `#server` alias instead of long relative paths.

```ts
import { formatUser } from '#server/utils/formatUser'
```

## Custom server directories

- `addServerScanDir()` tells Nitro to scan a custom directory as a server tree.
- `addServerImportsDir()` adds a custom directory for auto-imported server functions.

```ts
import { addServerScanDir, createResolver, defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  setup () {
    const { resolve } = createResolver(import.meta.url)
    addServerScanDir(resolve('./runtime/server'))
  },
})
```

## Filesystem and server access

- `server.fs.allow` defines which directories the Nuxt server may access.
- The documented defaults include `/.nuxt`, the source directory, the repo root, and the workspace directory.
- For persistent server data, Nuxt/Nitro exposes `useStorage()` and configurable storage mounts.

```ts
export default defineNuxtConfig({
  server: {
    fs: {
      allow: ['/.nuxt', '<srcDir>', '<rootDir>', '<workspaceDir>'],
    },
  },
})
```

```ts
export default defineEventHandler(async () => {
  const keys = await useStorage('redis').getKeys()
  return { keys }
})
```
