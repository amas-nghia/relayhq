---
source: Official docs
library: Bun
package: bun
topic: TypeScript compiler options and module patterns
fetched: 2026-04-14T00:00:00Z
official_docs: https://bun.com/docs/runtime/typescript
---

## Relevant Bun TypeScript settings

- Install Bun types with `bun add -d @types/bun` when writing Bun-aware TypeScript.
- Bun recommends `module: "Preserve"` and `moduleResolution: "bundler"` for Bun projects.
- `allowImportingTsExtensions: true` and `verbatimModuleSyntax: true` are part of the suggested Bun config.
- `types: ["bun"]` enables Bun globals.

## Module-pattern implications

- Bun expects modern ESM-friendly module patterns.
- Keep `noEmit: true` when Bun is acting as the runtime/tooling layer for TS source.
- Use strict flags (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`) for safer shared contracts.

## Note for Nuxt apps

- Nuxt generates and owns its TypeScript project-reference config; prefer Nuxt's `nuxt.config.ts` extension points over manual `tsconfig` edits.
