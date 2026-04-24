---
source: Context7 API
library: Bun
package: bun
topic: test runner usage
fetched: 2026-04-14T00:00:00Z
official_docs: https://bun.sh/docs/test
---

## Test file conventions

- Bun discovers test files matching:
  - `*.test.{js|jsx|ts|tsx}`
  - `*_test.{js|jsx|ts|tsx}`
  - `*.spec.{js|jsx|ts|tsx}`
  - `*_spec.{js|jsx|ts|tsx}`

## Writing tests

- Import testing APIs from `bun:test`:
  - `test`, `expect`, `describe`
  - lifecycle hooks like `beforeAll`, `beforeEach`, `afterEach`
  - `mock` and `spyOn`
- Use `test(...)` for assertions, `describe(...)` for grouping, and hooks for setup/teardown.
- Bun supports snapshot tests with `expect(value).toMatchSnapshot()`.

## Running tests

- Run all tests: `bun test`
- Watch mode: `bun test --watch`
- Coverage: `bun test --coverage`
- Filter by file or directory: `bun test <filter> ...`
- Run specific coverage subsets: `bun test --coverage src/components/*.test.ts`

## Useful modifiers

- `test.skip(...)` for skipped tests
- `test.todo(...)` for pending tests
