---
source: Context7 API
library: Bun
package: bun
topic: typescript cli fetch and bun test caveats
fetched: 2026-04-15T00:00:00Z
official_docs: https://bun.sh/docs
---

# Relevant docs for a Bun TypeScript CLI and tests

## TypeScript entrypoints

Source: https://github.com/oven-sh/bun/blob/main/README.md
Source: https://github.com/oven-sh/bun/blob/main/docs/runtime/index.mdx

- Bun runs `.ts` entrypoints directly.
- Minimal CLI entrypoint can just be `bun run index.ts`.
- Bun respects shebangs; if a script uses a Node shebang, Bun can still run it.

```bash
bun run index.ts
```

```js
#!/usr/bin/env node
```

## Fetch with JSON

Source: https://github.com/oven-sh/bun/blob/main/docs/guides/http/fetch.mdx

- Bun provides `fetch()` and standard `Response` handling.
- Send JSON with `JSON.stringify(...)` and `Content-Type: application/json`.
- Parse success or error payloads with `await response.json()`.

```ts
const response = await fetch("https://bun.com/api", {
  method: "POST",
  body: JSON.stringify({ message: "Hello from Bun!" }),
  headers: { "Content-Type": "application/json" },
});

const body = await response.json();
```

## bun test caveats

Source: https://github.com/oven-sh/bun/blob/main/docs/test/runtime-behavior.mdx

- `bun test` fails the run on unhandled promise rejections or errors that occur outside test blocks, even if assertions passed.
- This matters for CLI tests that start timers, background fetches, or fire-and-forget async code.

```ts
import { test } from "bun:test";

test("test 1", () => {
  expect(true).toBe(true);
});

setTimeout(() => {
  throw new Error("Unhandled error");
}, 0);

test("test 2", () => {
  expect(true).toBe(true);
});
```

Source: https://github.com/oven-sh/bun/blob/main/docs/test/runtime-behavior.mdx

```ts
process.on("uncaughtException", error => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});
```

## Test setup and mocking

Source: https://github.com/oven-sh/bun/blob/main/docs/test/configuration.mdx

- Use `preload` scripts from `bunfig.toml` or CLI flags for shared test setup.

```toml
[test]
preload = ["./test-setup.ts", "./global-mocks.ts"]
```

```bash
bun test --preload ./test-setup.ts --preload ./global-mocks.ts
```

Source: https://github.com/oven-sh/bun/blob/main/docs/test/lifecycle.mdx
Source: https://github.com/oven-sh/bun/blob/main/docs/test/mocks.mdx

- Use `mock.module(...)`, `beforeEach`, `afterEach`, and `mock.restore()` for test isolation.
- Useful if you want to mock a transport layer instead of hitting a real local Nitro server in unit tests.

```ts
import { beforeEach, afterEach, mock } from "bun:test";

beforeEach(() => {
  mock.module("./api-client", () => ({
    fetchUser: mock(() => Promise.resolve({ id: 1, name: "Test User" })),
  }));
});

afterEach(() => {
  mock.restore();
});
```

## Practical caveats for your CLI

- A Bun CLI can be plain TypeScript; no separate transpile step is required for the entrypoint.
- For HTTP error handling, do not assume `fetch` throws on non-2xx; inspect `response.ok`/`response.status`, then parse the JSON body.
- For tests, await every async branch and avoid leaked timers/rejections, because `bun test` treats them as run failures.
- Use preload/setup files for global env like `API_URL=http://127.0.0.1:3000`.
