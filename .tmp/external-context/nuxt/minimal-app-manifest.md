---
source: Context7 API
library: Nuxt
package: nuxt_3_x
topic: minimal app manifest
official_docs: https://nuxt.com/docs/3.x/directory-structure
---

## package.json

```json
{
  "name": "nuxt-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "preview": "nuxt preview",
    "postinstall": "nuxt prepare",
    "test": "bun test"
  }
}
```

## nuxt.config.ts

```ts
export default defineNuxtConfig({})
```

Only override `srcDir` / `dir.app` if you need a non-default app location.

## app directory structure

- `app.vue` as the root shell (`<NuxtLayout><NuxtPage /></NuxtLayout>`)
- `pages/` for file-based routes
- `layouts/` for shared page wrappers
- `components/`, `composables/`, `plugins/`, `utils/`, `assets/`, `middleware/`

## recommended commands

- `bun install`
- `bun run dev`
- `bun run build`
- `bun test`
