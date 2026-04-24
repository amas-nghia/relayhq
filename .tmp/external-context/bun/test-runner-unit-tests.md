---
source: Context7 API
library: Bun
package: bun
topic: test runner unit tests
fetched: 2026-04-14T00:00:00Z
official_docs: https://bun.sh/docs/test
---

## Test discovery

- Bun recursively discovers `*.test.{js|jsx|ts|tsx}`.
- It also matches `*_test.{js|jsx|ts|tsx}`, `*.spec.{js|jsx|ts|tsx}`, and `*_spec.{js|jsx|ts|tsx}`.
- Run with `bun test`; use `--watch` or `--coverage` as needed.

## Writing unit tests

- Import from `bun:test`.
- Use `describe()` to group related cases and `test()` for individual assertions.

```ts
import { test, expect, describe } from 'bun:test'

describe('math', () => {
  test('adds', () => {
    expect(2 + 2).toEqual(4)
  })
})
```

## Setup, teardown, and mocks

- Use `beforeEach()` / `afterEach()` for per-test isolation.
- Use `mock.module()` to replace dependencies.
- Call `mock.restore()` and `mock.clearAllMocks()` in teardown when needed.

```ts
import { beforeEach, afterEach, mock } from 'bun:test'

beforeEach(() => {
  mock.module('./api-client', () => ({
    fetchUser: mock(() => Promise.resolve({ id: 1 })),
  }))
})

afterEach(() => {
  mock.restore()
  mock.clearAllMocks()
})
```
