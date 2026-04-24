---
source: Context7 API
library: Nuxt 3 / Nitro / h3
package: nuxt-nitro-h3
topic: minimal cli calling local nitro h3 endpoints
fetched: 2026-04-15T00:00:00Z
official_docs: https://nuxt.com/docs/3.x
---

# Relevant docs for a minimal TypeScript CLI hitting local Nitro/h3 endpoints

## Nuxt 3 server routes and API errors

Source: https://nuxt.com/docs/3.x/directory-structure/server

- Server routes can throw `createError({ status, statusText })` to return explicit HTTP errors.
- If you do not throw a handled error, Nuxt defaults to a `500 Internal Server Error`.

```ts
export default defineEventHandler((event) => {
  const id = Number.parseInt(event.context.params.id) as number

  if (!Number.isInteger(id)) {
    throw createError({
      status: 400,
      statusText: 'ID should be an integer',
    })
  }

  return 'All good'
})
```

Source: https://nuxt.com/docs/3.x/api/utils/create-error

```ts
export default eventHandler(() => {
  throw createError({
    status: 404,
    statusText: 'Page Not Found',
  })
})
```

## Nitro file-based handlers and internal fetch caveat

Source: https://github.com/nitrojs/nitro/blob/main/docs/1.docs/2.quick-start.md

- `server/api/test.ts` maps to `/api/test`.
- Returning an object serializes JSON automatically.

```ts
import { defineHandler } from "nitro";

export default defineHandler(() => {
  return { message: "Hello Nitro!" };
});
```

Source: https://context7.com/nitrojs/nitro/llms.txt

- Method-specific handlers are filename-based, e.g. `server/routes/users.post.ts`.
- Read JSON bodies with native `event.req.json()`.

```ts
import { defineHandler } from "nitro";

export default defineHandler(async (event) => {
  const body = await event.req.json();
  return { created: true, user: body };
});
```

Source: https://github.com/nitrojs/nitro/blob/main/docs/4.examples/server-fetch.md

- Nitro's `fetch`/`serverFetch` is for in-process server-side internal route calls.
- For a separate local CLI process, use standard `fetch("http://127.0.0.1:PORT/api/...")`, not Nitro internal fetch.

```ts
import { defineConfig, serverFetch } from "nitro";

export default defineConfig({
  serverDir: "./",
  hooks: {
    "dev:start": async () => {
      const res = await serverFetch("/hello");
      const text = await res.text();
      console.log("Fetched /hello in nitro module:", res.status, text);
    },
  },
});
```

## Nitro global JSON error handling

Source: https://context7.com/nitrojs/nitro/llms.txt

- Nitro supports a custom global error handler.
- This is the cleanest way to guarantee JSON error payloads for CLI callers.

```ts
export default defineNitroErrorHandler((error, event) => {
  const isDev = process.env.NODE_ENV === "development";

  return new Response(
    JSON.stringify({
      error: error.message,
      statusCode: error.statusCode || 500,
      stack: isDev ? error.stack : undefined,
    }),
    {
      status: error.statusCode || 500,
      headers: { "Content-Type": "application/json" },
    }
  );
});
```

## h3 JSON error shape and caveats

Source: https://github.com/h3js/h3/blob/main/docs/1.guide/1.basics/6.error.md

- Throw `HTTPError` for stable JSON errors.
- h3 includes `status`, `statusText`, `message`, and optional `data` in the JSON response.
- Unhandled non-`HTTPError` exceptions are masked for security; `data`, `body`, `stack`, and sometimes `message` are not reliably exposed.

```ts
import { HTTPError } from "h3";

throw new HTTPError({
  status: 400,
  statusText: "Bad Request",
  message: "Invalid user input",
  data: { field: "email" },
});
```

Returned JSON example:

```json
{
  "date": "2025-06-05T04:20:00.0Z",
  "status": 400,
  "statusText": "Bad Request",
  "message": "Invalid user input",
  "data": {
    "field": "email"
  }
}
```

Source: https://context7.com/h3js/h3/llms.txt

- `onError` can log or transform errors globally.
- Use `event.req.json()` for request parsing because h3 leans on native Web APIs.

## Practical caveats for your CLI/server contract

- Prefer explicit handled errors (`createError` or `HTTPError`) if the CLI must parse JSON failures cleanly.
- If you want a consistent top-level shape such as `{ error, statusCode, data }`, implement a Nitro global error handler.
- Treat Nitro internal fetch helpers as server-only; a Bun CLI should call the running server over normal HTTP.
- Route files and HTTP method suffixes matter for endpoint URLs and allowed verbs.
