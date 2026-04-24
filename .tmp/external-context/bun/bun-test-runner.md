---
source: Context7 API
library: Bun
package: bun
topic: bun:test usage
fetched: 2026-04-14T00:00:00Z
official_docs: https://bun.com/docs/test
---

## Core API

Use imports from `bun:test`:

```ts
import { test, expect, describe, beforeAll, beforeEach, afterEach, afterAll, mock, spyOn } from 'bun:test'
```

## Common patterns

- `test(name, fn)` for unit tests.
- `describe(name, fn)` for grouping.
- `beforeEach` / `afterEach` for test isolation.
- `beforeAll` / `afterAll` for shared setup/teardown.

## Mocking

`mock()` creates mocked functions; `mock.module()` can replace imported modules.

Use cleanup to avoid leakage:

```ts
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

Assertions commonly used with mocks:

- `toHaveBeenCalled()`
- `toHaveBeenCalledTimes(n)`
- `toHaveBeenCalledWith(...)`
- `toHaveBeenLastCalledWith(...)`

## File patterns

Bun discovers tests by default in files matching:

```txt
*.test.{js|jsx|ts|tsx}
*_test.{js|jsx|ts|tsx}
*.spec.{js|jsx|ts|tsx}
*_spec.{js|jsx|ts|tsx}
```

## Useful commands

```bash
bun test
bun test --watch
bun test --coverage
bun test --update-snapshots
```

## Practical takeaway

For Nuxt + TypeScript + Bun unit tests, keep server-bridge logic in plain modules and test them directly with `bun:test`, using mocks and lifecycle hooks to isolate side effects.
