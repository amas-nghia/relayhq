---
source: Official docs
library: Vue 3
package: vue
topic: TypeScript with Composition API and <script setup>
fetched: 2026-04-14T00:00:00Z
official_docs: https://vuejs.org/guide/typescript/composition-api
---

## Relevant Vue 3 TypeScript patterns

- `<script setup lang="ts">` supports type-based and runtime-based macros.
- `defineProps()` can infer types from runtime declarations, but importing a type is often cleaner for shared contracts.
- Imported interfaces/types work with `defineProps<T>()`.

```ts
import type { Props } from './foo'

const props = defineProps<Props>()
```

## Shared-type-friendly guidance

- You can import props types from a relative file, a path alias (for example `@/types`), or an external dependency.
- In Vue 3.3+, imported and some complex types are supported in type parameters, but conditional types are still limited for whole-props inference.

## Typed emits

```ts
const emit = defineEmits<{
  change: [id: number]
  update: [value: string]
}>()
```

## General best practices

- Use explicit types for DOM event handlers in strict mode.
- Use `InjectionKey` in a separate file for shared provide/inject contracts.
