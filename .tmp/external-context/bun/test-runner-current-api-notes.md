---
source: Official docs
library: Bun
package: bun:test
topic: describe test expect async rejection assertions
fetched: 2026-04-14T00:00:00Z
official_docs: https://bun.com/docs/test/writing-tests.md
---

## describe

`describe()` groups related tests.

```ts
import { describe, expect, test } from "bun:test";

describe("sum()", () => {
  test("can sum two values", () => {
    expect(1 + 1).toBe(2);
  });
});
```

## test

`test()` runs a test. Async tests are supported via `async` functions or a `done` callback.

Default per-test timeout is `5000ms` unless overridden.

```ts
import { expect, test } from "bun:test";

test("async example", async () => {
  const result = await Promise.resolve(4);
  expect(result).toEqual(4);
});
```

## expect

`expect()` asserts on a value. Bun’s current matcher set includes promise matchers for resolved/rejected values.

Supported promise matchers:

- `expect(promise).resolves`
- `expect(promise).rejects`
- asymmetric `expect.resolvesTo`
- asymmetric `expect.rejectsTo`

## async rejection assertions

Use `await expect(promise).rejects...` when asserting a promise rejects.

```ts
await expect(Promise.reject("error")).rejects.toBe("error");
await expect(async () => {
  throw new Error("User not found");
}).rejects.toThrow("User not found");
```

For asymmetric matching with `toEqual`, use `expect.rejectsTo`:

```ts
expect(Promise.reject("error")).toEqual(
  expect.rejectsTo.stringContaining("error"),
);
```

## nuance to keep in mind

- `rejects` is a matcher on the promise chain.
- `rejectsTo` is an asymmetric matcher used inside `toEqual()`.
- The docs show `await` with `rejects` in async tests.
