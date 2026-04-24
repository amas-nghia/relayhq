---
source: Context7 API
library: Nuxt
package: nuxt
topic: shared directory and pure modules
fetched: 2026-04-14T00:00:00Z
official_docs: https://nuxt.com/docs/3.x/directory-structure/shared
---

## Shared directory

The `shared/` directory contains code that can be used in both the Vue app and the Nitro server.

Key constraints:

- available in Nuxt v3.14+
- can be imported from app code and server code
- cannot import Vue-specific or Nitro-specific code

Nuxt automatically provides the `#shared` alias:

```ts
import capitalize from '#shared/capitalize'
import lower from '#shared/formatters/lower'
import upper from '#shared/utils/formatters/upper'
```

## Implication for testable service modules

If a module has no Nuxt/Vue/Nitro dependencies, keep it framework-free and import it normally from tests.
If it needs runtime config, request objects, or other Nitro APIs, keep that edge thin and delegate the core logic to a pure module.
