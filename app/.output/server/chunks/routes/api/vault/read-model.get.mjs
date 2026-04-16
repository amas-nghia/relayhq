import { d as defineEventHandler } from '../../../nitro/nitro.mjs';
import { r as readCanonicalVaultReadModel } from '../../../_/read.mjs';
import { r as resolveVaultWorkspaceRoot } from '../../../_/runtime.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:url';
import 'node:fs/promises';

const readModel_get = defineEventHandler(async () => {
  const vaultRoot = resolveVaultWorkspaceRoot();
  return await readCanonicalVaultReadModel(vaultRoot);
});

export { readModel_get as default };
//# sourceMappingURL=read-model.get.mjs.map
