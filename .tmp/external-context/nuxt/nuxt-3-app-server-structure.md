---
source: Context7 API
library: Nuxt
package: nuxt
topic: app/server structure and pure server-side modules
fetched: 2026-04-14T00:00:00Z
official_docs: https://nuxt.com/docs/3.x/directory-structure
---

## Directory structure

Nuxt lets you customize the default directory structure, but it recommends sticking with defaults unless needed.

Relevant defaults:

```ts
export default defineNuxtConfig({
  srcDir: '.',
  dir: {
    app: 'app',
  },
})
```

`srcDir` defines the source directory of the app. `dir.app` sets the prefix for app files such as `app/router.options.ts` and `app/spa-loading-template.html`.

## Server directory

The server directory is dedicated to server-side handlers and API endpoints.

```text
server/
  api/        # /api/*
  routes/     # custom routes
  middleware/ # request middleware
  plugins/    # server plugins
  utils/      # server utilities
```

Nuxt/Nitro automatically registers files in `server/api`, `server/routes`, and `server/middleware`.

`defineEventHandler` is the standard API for defining server endpoints and middleware:

```ts
export default defineEventHandler(async (event) => {
  // server logic
})
```

## Server utilities and auto-imports

In the `server` directory, Nuxt auto-imports exported functions and variables from `server/utils/`.

For custom Nitro scan locations, Nuxt Kit exposes:

```ts
addServerScanDir(resolve('./runtime/server'))
addServerImportsDir(resolve('./runtime/server/composables'))
```

`addServerScanDir` lets Nitro recognize `api`, `routes`, `middleware`, and `utils` inside that directory.

## Pure service modules

For framework-agnostic service code, Nuxt’s `shared/` directory is the relevant convention:

- usable from both the Vue app and Nitro server
- available in Nuxt v3.14+
- cannot import Vue- or Nitro-specific code
- import via `#shared/...`

That makes `shared/` the safest place for pure service modules you want to test as plain TypeScript.

## Useful aliases

```json
{
  "#shared": "/<rootDir>/shared/",
  "#server": "/<srcDir>/server/"
}
```
